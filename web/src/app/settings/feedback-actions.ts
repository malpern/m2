"use server";

import { revalidatePath } from "next/cache";

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

  const issues = await res.json();
  return issues.map((issue: any) => ({
    number: issue.number,
    title: issue.title.replace(/^\[Feedback\]\s*/, ""),
    body: issue.body?.replace(/\*\*User Feedback\*\*\n\n/, "").replace(/\n\n---\n_Submitted from M2 Scheduler app_/, "") ?? "",
    state: issue.state,
    createdAt: issue.created_at,
    url: issue.html_url,
  }));
}

export async function deleteFeedback(issueNumber: number) {
  // GitHub doesn't support deleting issues via API, so we close it with a label
  await ghFetch(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", labels: ["feedback", "deleted"] }),
  });
  revalidatePath("/settings");
}
