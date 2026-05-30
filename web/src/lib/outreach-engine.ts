import type { Client, Session, Outreach } from "@/db/schema";
import { OUTREACH_DEFAULTS, type OutreachConfig } from "./outreach-config";

export type OutreachStatus =
  | "standing"
  | "pending"
  | "sent"
  | "send_failed"
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
  wave: number; // 1, 2, or 3
  sendError: string | null;
  outreachId: number | null;
  isAutoFill: boolean;
  messageCount: number;
  outreachGroupId: string | null;
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
  let pendingCount = 0;

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
    let sendError: string | null = null;
    let outreachId: number | null = null;

    let outreachGroupId: string | null = null;

    if (isStanding) {
      status = "standing";
    } else if (existing) {
      sentAt = existing.sentAt;
      outreachId = existing.id;
      outreachGroupId = existing.outreachGroupId;
      if (existing.sendError) {
        status = "send_failed";
        sendError = existing.sendError;
      } else {
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
    }

    if (session.status === "confirmed" && status !== "confirmed" && status !== "standing") {
      status = "confirmed";
    }

    let wave = 0;
    if (!isStanding && status === "pending") {
      pendingCount++;
      if (pendingCount <= config.wave1Size) {
        wave = 1;
      } else if (pendingCount <= config.wave1Size * 2) {
        wave = 2;
      } else {
        wave = 3;
      }
    } else if (!isStanding) {
      // Already sent — figure out which wave they were in based on position
      wave = 1;
    }

    // Detect auto-fill: sent message contains "just opened up"
    const sentMessage = existing?.messageText ?? "";
    const isAutoFill = sentMessage.toLowerCase().includes("just opened up");

    // Count all outreach records for this session (sent + received)
    const messageCount = existingOutreach.filter(
      (o) => o.sessionId === session.id
    ).length;

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
      wave: isStanding ? 0 : wave,
      sendError,
      outreachId,
      isAutoFill,
      messageCount,
      outreachGroupId,
    });
  }

  return items;
}

function isStandingSession(
  session: { clientId: number; slot: string; scheduledDate: string; standingSlot: string | null }
): boolean {
  if (!session.standingSlot) return false;
  const dayOfWeek = new Date(session.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const shortDay = dayOfWeek.slice(0, 3);
  const standing = session.standingSlot.toLowerCase();
  return standing.includes(`${shortDay} ${session.slot}`) || standing.includes(`${dayOfWeek} ${session.slot}`);
}

function mapInterpretation(interpretation: string | null, outreachStatus: string): OutreachStatus {
  switch (interpretation) {
    case "confirmed": return "confirmed";
    case "selecting_offered_slot": return "confirmed";
    case "declined": return "declined";
    case "declined_skip_week": return "declined";
    case "declined_wants_options": return "reschedule";
    case "declined_with_alternative": return "reschedule";
    case "reschedule_request": return "reschedule";
    case "ambiguous": return "ambiguous";
    default:
      if (outreachStatus === "expired") return "moved_on";
      return "sent";
  }
}

/**
 * Returns the next wave of clients to text.
 * Wave 1: send immediately (top 6-10 by priority)
 * Wave 2: send after ~45 min regardless of replies
 * Wave 3: send after ~2 hours (everyone else)
 */
export function getNextWaveToSend(
  items: OutreachItem[],
  config: OutreachConfig = OUTREACH_DEFAULTS,
): { wave: number; items: OutreachItem[] } {
  const sentItems = items.filter((i) => i.status !== "pending" && i.status !== "standing");
  const pendingItems = items.filter((i) => i.status === "pending");

  if (pendingItems.length === 0) return { wave: 0, items: [] };

  // No outreach sent yet — wave 1 is ready
  if (sentItems.length === 0) {
    return { wave: 1, items: pendingItems.filter((i) => i.wave === 1) };
  }

  // Find the earliest sent time
  const earliestSent = sentItems
    .filter((i) => i.sentAt)
    .map((i) => new Date(i.sentAt!).getTime())
    .sort((a, b) => a - b)[0];

  if (!earliestSent) {
    return { wave: 1, items: pendingItems.filter((i) => i.wave === 1) };
  }

  const elapsed = Date.now() - earliestSent;
  const wave2Ready = elapsed >= config.wave2DelayMinutes * 60 * 1000;
  const wave3Ready = elapsed >= config.wave3DelayMinutes * 60 * 1000;

  if (wave3Ready) {
    const w3 = pendingItems.filter((i) => i.wave === 3);
    if (w3.length > 0) return { wave: 3, items: w3 };
    const w2 = pendingItems.filter((i) => i.wave === 2);
    if (w2.length > 0) return { wave: 2, items: w2 };
  }

  if (wave2Ready) {
    const w2 = pendingItems.filter((i) => i.wave === 2);
    if (w2.length > 0) return { wave: 2, items: w2 };
  }

  // Wave 1 still pending
  const w1 = pendingItems.filter((i) => i.wave === 1);
  if (w1.length > 0) return { wave: 1, items: w1 };

  return { wave: 0, items: [] };
}

// Keep backward compat for the outreach page
export function getNextBatchToSend(items: OutreachItem[]): OutreachItem[] {
  return getNextWaveToSend(items).items;
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
    failed: items.filter((i) => i.status === "send_failed").length,
    needsAttention: items.filter((i) => i.status === "reschedule" || i.status === "ambiguous").length,
    noReply: items.filter((i) => i.status === "no_reply").length,
    movedOn: items.filter((i) => i.status === "moved_on").length,
  };
}
