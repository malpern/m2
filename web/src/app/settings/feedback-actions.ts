"use server";

import { revalidatePath } from "next/cache";
import { findIssue } from "@/lib/issue-number";

const REPO = "malpern/m2";

async function ghFetch(path: string, options: RequestInit = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export interface FeedbackItem {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: string;
  url: string;
}

// Shape of the subset of the GitHub Issues API response we consume.
interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  created_at: string;
  html_url: string;
}

export async function submitFeedback(title: string, body: string): Promise<FeedbackItem> {
  const res = await ghFetch("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: `[Feedback] ${title}`,
      body: `**User Feedback**\n\n${body}\n\n---\n_Submitted from M2 Scheduler app_`,
      labels: ["feedback"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create issue: ${err}`);
  }

  const issue = await res.json();
  revalidatePath("/settings");
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    createdAt: issue.created_at,
    url: issue.html_url,
  };
}

export async function getFeedbackItems(): Promise<FeedbackItem[]> {
  const res = await ghFetch("/issues?labels=feedback&state=all&sort=created&direction=desc&per_page=50");
  if (!res.ok) return [];

  const issues: GitHubIssue[] = await res.json();
  return issues.map((issue) => ({
    number: issue.number,
    title: issue.title.replace(/^\[Feedback\]\s*/, ""),
    body: issue.body?.replace(/\*\*User Feedback\*\*\n\n/, "").replace(/\n\n---\n_Submitted from M2 Scheduler app_/, "") ?? "",
    state: issue.state as "open" | "closed",
    createdAt: issue.created_at,
    url: issue.html_url,
  }));
}

export async function deleteFeedback(issueNumber: number) {
  // A server action is a network boundary: this argument is deserialized from
  // a request and TypeScript's `number` is erased at runtime. Resolve it
  // against the feedback issues on record rather than trusting it — see
  // findIssue. Note this only sees the most recent 50, which is far more
  // feedback than this app has ever collected.
  const target = findIssue(await getFeedbackItems(), issueNumber);
  if (!target) {
    throw new Error(`No feedback item with number ${String(issueNumber)}`);
  }

  // GitHub doesn't support deleting issues via API, so we close it with a label
  await ghFetch(`/issues/${target.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", labels: ["feedback", "deleted"] }),
  });
  revalidatePath("/settings");
}
