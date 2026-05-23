import type { Client, Session, Outreach } from "@/db/schema";
import { OUTREACH_DEFAULTS, type OutreachConfig } from "./outreach-config";

export type OutreachStatus =
  | "standing"
  | "pending"
  | "sent"
  | "confirmed"
  | "declined"
  | "reschedule"
  | "ambiguous"
  | "no_reply"
  | "moved_on";

export interface OutreachItem {
  sessionId: number;
  clientId: number;
  clientName: string;
  clientPhone: string;
  day: string;
  slot: string;
  date: string;
  time: string;
  status: OutreachStatus;
  isStanding: boolean;
  sentAt: string | null;
  repliedAt: string | null;
  replyText: string | null;
  interpretation: string | null;
  batchNumber: number;
}

export function buildOutreachQueue(
  sessions: (Session & { clientName: string; clientPhone: string; standingSlot: string | null })[],
  existingOutreach: Outreach[],
  config: OutreachConfig = OUTREACH_DEFAULTS,
): OutreachItem[] {
  const slotPriority: Record<string, number> = {
    "3pm": 0, "4pm": 1, "5pm": 2, "6pm": 3, "7pm": 4,
  };

  const sorted = [...sessions].sort((a, b) => {
    const slotA = slotPriority[a.slot] ?? 5;
    const slotB = slotPriority[b.slot] ?? 5;
    return slotA - slotB;
  });

  const items: OutreachItem[] = [];
  let batchNum = 1;
  let inBatch = 0;

  for (const session of sorted) {
    const isStanding = isStandingSession(session);
    const existing = existingOutreach.find(
      (o) => o.sessionId === session.id && o.direction === "sent"
    );

    let status: OutreachStatus = "pending";
    let sentAt: string | null = null;
    let repliedAt: string | null = null;
    let replyText: string | null = null;
    let interpretation: string | null = null;

    if (isStanding) {
      status = "standing";
    } else if (existing) {
      sentAt = existing.sentAt;
      const reply = existingOutreach.find(
        (o) => o.sessionId === session.id && o.direction === "received"
      );
      if (reply) {
        repliedAt = reply.repliedAt;
        replyText = reply.messageText;
        interpretation = reply.interpretation;
        status = mapInterpretation(reply.interpretation, reply.status);
      } else {
        status = "sent";
      }
    }

    if (!isStanding && status === "pending") {
      inBatch++;
      if (inBatch > config.batchSize) {
        batchNum++;
        inBatch = 1;
      }
    }

    items.push({
      sessionId: session.id,
      clientId: session.clientId,
      clientName: session.clientName,
      clientPhone: session.clientPhone,
      day: session.scheduledDate,
      slot: session.slot,
      date: session.scheduledDate,
      time: session.scheduledTime,
      status,
      isStanding,
      sentAt,
      repliedAt,
      replyText,
      interpretation,
      batchNumber: isStanding ? 0 : batchNum,
    });
  }

  return items;
}

function isStandingSession(
  session: { clientId: number; slot: string; scheduledDate: string; standingSlot: string | null }
): boolean {
  if (!session.standingSlot) return false;
  const dayOfWeek = new Date(session.scheduledDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const shortDay = dayOfWeek.slice(0, 3);
  const standing = session.standingSlot.toLowerCase();
  return standing.includes(`${shortDay} ${session.slot}`) || standing.includes(`${dayOfWeek} ${session.slot}`);
}

function mapInterpretation(interpretation: string | null, outreachStatus: string): OutreachStatus {
  switch (interpretation) {
    case "confirmed": return "confirmed";
    case "declined": return "declined";
    case "reschedule_request": return "reschedule";
    case "ambiguous": return "ambiguous";
    default:
      if (outreachStatus === "expired") return "moved_on";
      return "sent";
  }
}

export function getNextBatchToSend(items: OutreachItem[]): OutreachItem[] {
  const sentBatches = new Set(
    items.filter((i) => i.status !== "pending" && i.status !== "standing").map((i) => i.batchNumber)
  );

  const pendingItems = items.filter((i) => i.status === "pending");
  if (pendingItems.length === 0) return [];

  const nextBatch = pendingItems[0].batchNumber;

  const currentBatchSent = items.filter(
    (i) => i.batchNumber === nextBatch - 1 && i.status === "sent"
  );
  const currentBatchConfirmed = items.filter(
    (i) => i.batchNumber === nextBatch - 1 && i.status === "confirmed"
  );

  if (nextBatch > 1 && currentBatchConfirmed.length === 0 && currentBatchSent.length > 0) {
    return [];
  }

  return pendingItems.filter((i) => i.batchNumber === nextBatch);
}

export function getNeedsFollowUp(
  items: OutreachItem[],
  config: OutreachConfig = OUTREACH_DEFAULTS,
): OutreachItem[] {
  const now = Date.now();
  return items.filter((i) => {
    if (i.status !== "sent" || !i.sentAt) return false;
    const elapsed = now - new Date(i.sentAt).getTime();
    const followUpMs = config.followUpAfterMinutes * 60 * 1000;
    const moveOnMs = config.moveOnAfterMinutes * 60 * 1000;
    return elapsed >= followUpMs && elapsed < moveOnMs;
  });
}

export function getNeedsMoveOn(
  items: OutreachItem[],
  config: OutreachConfig = OUTREACH_DEFAULTS,
): OutreachItem[] {
  const now = Date.now();
  return items.filter((i) => {
    if (i.status !== "sent" || !i.sentAt) return false;
    const elapsed = now - new Date(i.sentAt).getTime();
    const moveOnMs = config.moveOnAfterMinutes * 60 * 1000;
    return elapsed >= moveOnMs;
  });
}

export function getNeedsMattAttention(items: OutreachItem[]): OutreachItem[] {
  return items.filter((i) => i.status === "reschedule" || i.status === "ambiguous");
}

export function getOutreachSummary(items: OutreachItem[]) {
  return {
    total: items.length,
    standing: items.filter((i) => i.status === "standing").length,
    pending: items.filter((i) => i.status === "pending").length,
    sent: items.filter((i) => i.status === "sent").length,
    confirmed: items.filter((i) => i.status === "confirmed").length,
    declined: items.filter((i) => i.status === "declined").length,
    needsAttention: items.filter((i) => i.status === "reschedule" || i.status === "ambiguous").length,
    noReply: items.filter((i) => i.status === "no_reply").length,
    movedOn: items.filter((i) => i.status === "moved_on").length,
  };
}
