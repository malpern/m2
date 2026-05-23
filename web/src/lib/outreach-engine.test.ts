import { describe, it, expect } from "vitest";
import {
  buildOutreachQueue,
  getNextBatchToSend,
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
      makeSession({
        id: 1,
        scheduledDate: "2026-05-25", // Monday
        slot: "3pm",
        standingSlot: "Mon 3pm",
      }),
    ];

    const queue = buildOutreachQueue(sessions, []);
    expect(queue[0].status).toBe("standing");
    expect(queue[0].isStanding).toBe(true);
  });

  it("assigns batches of 3", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      makeSession({ id: i + 1, clientId: i + 1, clientName: `Client ${i}` })
    );

    const queue = buildOutreachQueue(sessions, []);
    const pending = queue.filter((q) => q.status === "pending");
    expect(pending.filter((q) => q.batchNumber === 1)).toHaveLength(3);
    expect(pending.filter((q) => q.batchNumber === 2)).toHaveLength(3);
    expect(pending.filter((q) => q.batchNumber === 3)).toHaveLength(1);
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

  it("standing sessions get batch 0", () => {
    const sessions = [
      makeSession({ id: 1, scheduledDate: "2026-05-25", slot: "3pm", standingSlot: "Mon 3pm" }),
      makeSession({ id: 2, clientId: 2, clientName: "Other" }),
    ];

    const queue = buildOutreachQueue(sessions, []);
    expect(queue.find((q) => q.isStanding)?.batchNumber).toBe(0);
    expect(queue.find((q) => !q.isStanding)?.batchNumber).toBe(1);
  });
});

describe("getNextBatchToSend", () => {
  it("returns first batch when nothing sent", () => {
    const items = [
      { batchNumber: 1, status: "pending" as const },
      { batchNumber: 1, status: "pending" as const },
      { batchNumber: 2, status: "pending" as const },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, sentAt: null, repliedAt: null,
      replyText: null, interpretation: null, ...o,
    }));

    const next = getNextBatchToSend(items);
    expect(next).toHaveLength(2);
    expect(next[0].batchNumber).toBe(1);
  });

  it("returns empty if waiting for confirmation in current batch", () => {
    const items = [
      { batchNumber: 1, status: "sent" as const, sentAt: new Date().toISOString() },
      { batchNumber: 1, status: "sent" as const, sentAt: new Date().toISOString() },
      { batchNumber: 2, status: "pending" as const, sentAt: null },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, repliedAt: null,
      replyText: null, interpretation: null, ...o,
    }));

    const next = getNextBatchToSend(items);
    expect(next).toHaveLength(0);
  });

  it("releases next batch when one confirmation received", () => {
    const items = [
      { batchNumber: 1, status: "confirmed" as const, sentAt: "2026-05-25T09:00:00Z" },
      { batchNumber: 1, status: "sent" as const, sentAt: "2026-05-25T09:00:00Z" },
      { batchNumber: 2, status: "pending" as const, sentAt: null },
    ].map((o, i) => ({
      sessionId: i, clientId: i, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      isStanding: false, repliedAt: null,
      replyText: null, interpretation: null, ...o,
    }));

    const next = getNextBatchToSend(items);
    expect(next).toHaveLength(1);
    expect(next[0].batchNumber).toBe(2);
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
      replyText: null, interpretation: null, batchNumber: 1,
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
      replyText: null, interpretation: null, batchNumber: 1,
    }];

    expect(getNeedsMoveOn(items)).toHaveLength(1);
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
      replyText: null, interpretation: null, batchNumber: 1, ...o,
    }));

    const flagged = getNeedsMattAttention(items);
    expect(flagged).toHaveLength(2);
  });
});

describe("getNeedsMattAttention", () => {
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
      replyText: null, interpretation: null, batchNumber: 1, ...o,
    }));

    const flagged = getNeedsMattAttention(items);
    expect(flagged).toHaveLength(0);
  });
});

describe("follow-up timing edge cases", () => {
  it("does not flag items sent less than 1 hour ago", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const items = [{
      sessionId: 1, clientId: 1, clientName: "", clientPhone: "",
      day: "", slot: "", date: "", time: "",
      status: "sent" as const, isStanding: false,
      sentAt: thirtyMinAgo, repliedAt: null,
      replyText: null, interpretation: null, batchNumber: 1,
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
      replyText: null, interpretation: null, batchNumber: 1,
    }];

    expect(getNeedsFollowUp(items)).toHaveLength(0);
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
      replyText: null, interpretation: null, batchNumber: 1, ...o,
    }));

    const summary = getOutreachSummary(items);
    expect(summary.total).toBe(7);
    expect(summary.standing).toBe(1);
    expect(summary.confirmed).toBe(2);
    expect(summary.needsAttention).toBe(1);
  });
});
