import { db } from "@/db";
import { outreach } from "@/db/schema";
import { getPackageBalance } from "@/lib/package-accounting";
import { syslog } from "@/lib/logger";
import { logAndSend, type WebhookContext } from "./shared";

const BALANCE_KEYWORDS = [
  "how many sessions", "sessions left", "sessions remaining",
  "session balance", "my balance", "how many do i have",
  "package balance", "sessions do i have",
];

export function isBalanceInquiry(lower: string): boolean {
  return BALANCE_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function handleBalanceInquiry(ctx: WebhookContext): Promise<void> {
  const { client, body, weekOf, firstName } = ctx;

  const balance = await getPackageBalance(client.id);
  await db.insert(outreach).values({
    clientId: client.id, sessionId: null, weekOf,
    direction: "received" as const, messageText: body,
    interpretation: "account_inquiry", status: "confirmed" as const,
    repliedAt: new Date().toISOString(),
  }).run();

  let reply: string;
  if (!balance) {
    reply = `Hey ${firstName}, I don't see an active package on file for you. Want me to check with Matt?`;
  } else if (balance.remaining <= 0) {
    reply = `Hey ${firstName}, looks like your package is all used up (${balance.used}/${balance.total} sessions used). Want me to ask Matt about getting more?`;
  } else {
    reply = `Hey ${firstName}, you have ${balance.remaining} session${balance.remaining === 1 ? "" : "s"} left on your package (${balance.used}/${balance.total} used).`;
  }
  await logAndSend(client.id, null, weekOf, client.phone, reply);
  syslog.info("outreach", `${firstName} asked about package balance`, `Balance: ${balance ? `${balance.remaining}/${balance.total}` : "no package"}`, { clientId: client.id });
}
