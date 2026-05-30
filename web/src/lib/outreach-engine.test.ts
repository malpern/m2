import { describe, it, expect } from "vitest";
import {
  buildOutreachQueue,
  getNextBatchToSend,
  getNextWaveToSend,
  getNeedsFollowUp,
  getNeedsMoveOn,
  getNeedsMattAttention,
  getOutreachSummary,
} from "./outreach-engine";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 1,
    clientName: "Test Client",
    clientPhone: "+1555",
    packageId: null,
    scheduledDate: "2026-05-25",
    scheduledTime: "15:00",
    slot: "3pm" as const,
    status: "proposed" as const,
    sessionType: null,
    gcalEventId: null,
    loggedToSheets: false,
    reconciled: false,
    createdAt: null,
    standingSlot: null,
    ...overrides,
  };
}

describe("buildOutreachQueue", () => {
  it("marks standing slot sessions as standing", () => {
    const sessions = [
      makeSession({ id: 1, scheduledDate: "2026-05-25", slot: "3pm", standingSlot: "Mon 3pm" }),
    ];
    const queue = buildOutreachQueue(sessions, []);
    expect(queue[0].status).toBe("standing");
    expect(queue[0].isStanding).toBe(true);
  });

  it("assigns wave 1 to first 8 clients by default", () => {
    const sessions = Array.from({ length: 20 }, (_, i) =>
      makeSession({ id: i + 1, clientId: i + 1, clientName: `Client ${i}` })
    );
    const queue = buildOutreachQueue(sessions, []);
    const pending = queue.filter((q) => q.status === "pending");
    expect(pending.filter((q) => q.wave === 1)).toHaveLength(8);
    expect(pending.filter((q) => q.wave === 2)).toHaveLength(8);
    expect(pending.filter((q) => q.wave === 3)).toHaveLength(4);
  });

  it("sorts by slot priority (3pm first)", () => {
    const sessions = [
      makeSession({ id: 1, slot: "6pm", clientName: "Late" }),
      makeSession({ id: 2, slot: "3pm", clientName: "Early" }),
      makeSession({ id: 3, slot: "5pm", clientName: "Mid" }),
    ];
    const queue = buildOutreachQueue(sessions, []);
    expect(queue[0].clientName).toBe("Early");
    expect(queue[1].clientName).toBe("Mid");
    expect(queue[2].clientName).toBe("Late");
  });

  it("standing sessions get wave 0", () => {
    const sessions = [
      makeSession({ id: 1, scheduledDate: "2026-05-25", slot: "3pm", standingSlot: "Mon 3pm" }),
      makeSession({ id: 2, clientId: 2, clientName: "Other" }),
    ];
    const queue = buildOutreachQueue(sessions, []);
    expect(queue.find((q) => q.isStanding)?.wave).toBe(0);
    expect(queue.find((q) => !q.isStanding)?.wave).toBe(1);
  });
});

describe("getNextWaveToSend", () => {
  it("returns wave 1 when nothing sent", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "pending" as const, isStanding: false,
      sentAt: null, repliedAt: null, replyText: null,
      interpretation: null, sendError: null, outreachId: null, wave: i < 8 ? 1 : 2,
    }));

    const result = getNextWaveToSend(items);
    expect(result.wave).toBe(1);
    expect(result.items).toHaveLength(8);
  });

  it("returns wave 2 after wave2DelayMinutes regardless of replies", () => {
    const fiftyMinAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
    const items = [
      ...Array.from({ length: 8 }, (_, i) => ({
        sessionId: i, clientId: i, clientName: "", clientPhone: "",
        day: "", slot: "", date: "", time: "",
        status: "sent" as const, isStanding: false,
        sentAt: fiftyMinAgo, repliedAt: null, replyText: null,
        interpretation: null, sendError: null, outreachId: null, wave: 1,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        sessionId: i + 8, clientId: i + 8, clientName: "", clientPhone: "",
        day: "", slot: "", date: "", time: "",
        status: "pending" as const, isStanding: false,
        sentAt: null, repliedAt: null, replyText: null,
        interpretation: null, sendError: null, outreachId: null, wave: 2,
      })),
    ];

    const result = getNextWaveToSend(items);
    expect(result.wave).toBe(2);
    expect(result.items).toHaveLength(5);
  });

  it("does not release wave 2 before delay", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const items = [
      { sessionId: 0, clientId: 0, clientName: "", clientPhone: "", day: "", slot: "", date: "", time: "", status: "sent" as const, isStanding: false, sentAt: tenMinAgo, repliedAt: null, replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1 },
      { sessionId: 1, clientId: 1, clientName: "", clientPhone: "", day: "", slot: "", date: "", time: "", status: "pending" as const, isStanding: false, sentAt: null, repliedAt: null, replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 2 },
    ];

    const result = getNextWaveToSend(items);
    expect(result.wave).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("returns wave 3 after wave3DelayMinutes", () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
    const items = [
      { sessionId: 0, clientId: 0, clientName: "", clientPhone: "", day: "", slot: "", date: "", time: "", status: "sent" as const, isStanding: false, sentAt: threeHoursAgo, repliedAt: null, replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1 },
      { sessionId: 1, clientId: 1, clientName: "", clientPhone: "", day: "", slot: "", date: "", time: "", status: "pending" as const, isStanding: false, sentAt: null, repliedAt: null, replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 3 },
    ];

    const result = getNextWaveToSend(items);
    expect(result.wave).toBe(3);
    expect(result.items).toHaveLength(1);
  });

  it("returns empty when all sent", () => {
    const items = [
      { sessionId: 0, clientId: 0, clientName: "", clientPhone: "", day: "", slot: "", date: "", time: "", status: "sent" as const, isStanding: false, sentAt: new Date().toISOString(), repliedAt: null, replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1 },
    ];
    const result = getNextWaveToSend(items);
    expect(result.items).toHaveLength(0);
  });
});

describe("follow-up and move-on", () => {
  it("flags items needing follow-up after 1 hour", () => {
    const hourAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();
    const items = [{
      sessionId: 1, clientId: 1, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "sent" as const, isStanding: false,
      sentAt: hourAgo, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1,
    }];
    expect(getNeedsFollowUp(items)).toHaveLength(1);
  });

  it("flags items to move on after 3 hours", () => {
    const threeHoursAgo = new Date(Date.now() - 200 * 60 * 1000).toISOString();
    const items = [{
      sessionId: 1, clientId: 1, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "sent" as const, isStanding: false,
      sentAt: threeHoursAgo, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1,
    }];
    expect(getNeedsMoveOn(items)).toHaveLength(1);
    expect(getNeedsFollowUp(items)).toHaveLength(0);
  });

  it("does not flag items sent less than 1 hour ago", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const items = [{
      sessionId: 1, clientId: 1, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "sent" as const, isStanding: false,
      sentAt: thirtyMinAgo, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1,
    }];
    expect(getNeedsFollowUp(items)).toHaveLength(0);
    expect(getNeedsMoveOn(items)).toHaveLength(0);
  });

  it("does not flag non-sent items for follow-up", () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const items = [{
      sessionId: 1, clientId: 1, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "confirmed" as const, isStanding: false,
      sentAt: twoHoursAgo, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1,
    }];
    expect(getNeedsFollowUp(items)).toHaveLength(0);
  });
});

describe("getNeedsMattAttention", () => {
  it("flags reschedule and ambiguous items", () => {
    const items = [
      { status: "confirmed" as const },
      { status: "reschedule" as const },
      { status: "ambiguous" as const },
      { status: "sent" as const },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, sentAt: null, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1, ...o,
    }));
    expect(getNeedsMattAttention(items)).toHaveLength(2);
  });

  it("does not flag confirmed or sent items", () => {
    const items = [
      { status: "confirmed" as const },
      { status: "sent" as const },
      { status: "standing" as const },
      { status: "pending" as const },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, sentAt: null, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1, ...o,
    }));
    expect(getNeedsMattAttention(items)).toHaveLength(0);
  });
});

describe("session.status fallback", () => {
  it("shows confirmed when session is confirmed but no reply record exists", () => {
    const sessions = [
      makeSession({ id: 1, status: "confirmed" as const }),
    ];
    const sentOutreach = [{
      id: 10, clientId: 1, sessionId: 1, weekOf: "2026-05-25",
      direction: "sent" as const, messageText: "Hey...",
      interpretation: null, status: "awaiting_reply" as const,
      sentAt: "2026-05-24T10:00:00Z", repliedAt: null, sendError: null,
    }];
    const queue = buildOutreachQueue(sessions, sentOutreach);
    expect(queue[0].status).toBe("confirmed");
  });

  it("shows confirmed when session confirmed with no outreach at all", () => {
    const sessions = [
      makeSession({ id: 1, status: "confirmed" as const }),
    ];
    const queue = buildOutreachQueue(sessions, []);
    expect(queue[0].status).toBe("confirmed");
  });
});

describe("getOutreachSummary", () => {
  it("counts all statuses", () => {
    const items = [
      { status: "standing" as const },
      { status: "pending" as const },
      { status: "sent" as const },
      { status: "confirmed" as const },
      { status: "confirmed" as const },
      { status: "declined" as const },
      { status: "reschedule" as const },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, sentAt: null, repliedAt: null,
      replyText: null, interpretation: null, sendError: null, outreachId: null, wave: 1, ...o,
    }));

    const summary = getOutreachSummary(items);
    expect(summary.total).toBe(7);
    expect(summary.standing).toBe(1);
    expect(summary.confirmed).toBe(2);
    expect(summary.needsAttention).toBe(1);
  });
});
