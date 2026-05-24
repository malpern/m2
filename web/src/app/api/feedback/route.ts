import { db } from "@/db";
import { guideFeedback } from "@/db/schema";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

async function generateTitle(text: string): Promise<string> {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length <= 8) return trimmed;
  if (!process.env.ANTHROPIC_API_KEY) return trimmed.slice(0, 60);
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 40,
      messages: [{
        role: "user",
        content: `Shorten this feedback to a GitHub issue title (max 8 words). Keep Matt's original words — just trim, don't reinterpret. Return only the title.\n\nFeedback: "${trimmed}"`,
      }],
    });
    const raw = response.content[0].type === "text" ? response.content[0].text : trimmed;
    return raw.trim().replace(/^["']|["']$/g, "");
  } catch {
    return trimmed.slice(0, 60);
  }
}

async function createGitHubIssue(title: string, body: string, sectionId: string | null) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");

  const sectionNote = sectionId ? `\n\n**Section:** ${sectionId}` : "";
  const res = await fetch("https://api.github.com/repos/malpern/m2/issues", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      title: `[Guide] ${title}`,
      body: `${body}${sectionNote}\n\n---\n_Submitted via guide.html inline feedback_`,
      labels: ["feedback"],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err}`);
  }
  return res.json();
}

async function checkIssueState(issueNumber: number): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return "open";
  try {
    const res = await fetch(`https://api.github.com/repos/malpern/m2/issues/${issueNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return "open";
    const data = await res.json();
    return data.state;
  } catch {
    return "open";
  }
}

export async function GET() {
  const allOpen = await db.select().from(guideFeedback)
    .where(eq(guideFeedback.issueState, "open")).all();

  const stillOpen = [];
  for (const fb of allOpen) {
    const state = await checkIssueState(fb.githubIssueNumber);
    if (state === "closed") {
      await db.update(guideFeedback)
        .set({ issueState: "closed" })
        .where(eq(guideFeedback.id, fb.id)).run();
    } else {
      stillOpen.push(fb);
    }
  }

  return NextResponse.json(stillOpen);
}

export async function POST(request: NextRequest) {
  try {
    const { xPercent, yPixels, sectionId, feedbackText } = await request.json();

    if (!feedbackText?.trim()) {
      return NextResponse.json({ error: "Feedback text required" }, { status: 400 });
    }

    const title = await generateTitle(feedbackText);
    const issue = await createGitHubIssue(title, feedbackText, sectionId);

    const row = await db.insert(guideFeedback).values({
      xPercent: Math.round(xPercent),
      yPixels: Math.round(yPixels),
      sectionId: sectionId || null,
      feedbackText: feedbackText.trim(),
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      issueState: "open",
    }).returning().get();

    return NextResponse.json(row);
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create feedback" },
      { status: 500 }
    );
  }
}
