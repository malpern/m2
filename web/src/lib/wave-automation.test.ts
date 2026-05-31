import { describe, it, expect } from "vitest";
import { getNextWaveToSend } from "./outreach-engine";
import type { OutreachItem } from "./outreach-engine";

function makeItem(overrides: Partial<OutreachItem>): OutreachItem {
  return {
    sessionId: 1, clientId: 1, clientName: "Test", clientPhone: "+1555",
    day: "", slot: "3pm", date: "2026-06-05", time: "15:00",
    status: "pending", isStanding: false,
    sentAt: null, repliedAt: null, replyText: null,
    interpretation: null, sendError: null, outreachId: null, wave: 1,
    isAutoFill: false, messageCount: 0, outreachGroupId: null,
    ...overrides,
  };
}

describe("wave automation logic", () => {
  it("wave 1 is ready when nothing has been sent", () => {
    const items = [
      makeItem({ sessionId: 1, wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, wave: 1 }),
      makeItem({ sessionId: 3, clientId: 3, wave: 2 }),
    ];
    const { wave, items: waveItems } = getNextWaveToSend(items);
    expect(wave).toBe(1);
    expect(waveItems).toHaveLength(2);
  });

  it("wave 2 is ready after wave2DelayMinutes", () => {
    const fiftyMinAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString();
    const items = [
      makeItem({ sessionId: 1, status: "sent", sentAt: fiftyMinAgo, wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, status: "pending", wave: 2 }),
    ];
    const { wave, items: waveItems } = getNextWaveToSend(items);
    expect(wave).toBe(2);
    expect(waveItems).toHaveLength(1);
  });

  it("wave 2 not ready before delay", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const items = [
      makeItem({ sessionId: 1, status: "sent", sentAt: tenMinAgo, wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, status: "pending", wave: 2 }),
    ];
    const { wave } = getNextWaveToSend(items);
    expect(wave).toBe(0);
  });

  it("wave 3 ready after wave3DelayMinutes", () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
    const items = [
      makeItem({ sessionId: 1, status: "sent", sentAt: threeHoursAgo, wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, status: "pending", wave: 3 }),
    ];
    const { wave, items: waveItems } = getNextWaveToSend(items);
    expect(wave).toBe(3);
    expect(waveItems).toHaveLength(1);
  });

  it("returns empty when all waves are sent", () => {
    const items = [
      makeItem({ sessionId: 1, status: "sent", sentAt: new Date().toISOString(), wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, status: "confirmed", sentAt: new Date().toISOString(), wave: 2 }),
    ];
    const { wave } = getNextWaveToSend(items);
    expect(wave).toBe(0);
  });

  it("skips wave 2 if all wave 2 items are already sent", () => {
    const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
    const items = [
      makeItem({ sessionId: 1, status: "sent", sentAt: threeHoursAgo, wave: 1 }),
      makeItem({ sessionId: 2, clientId: 2, status: "sent", sentAt: threeHoursAgo, wave: 2 }),
      makeItem({ sessionId: 3, clientId: 3, status: "pending", wave: 3 }),
    ];
    const { wave, items: waveItems } = getNextWaveToSend(items);
    expect(wave).toBe(3);
    expect(waveItems).toHaveLength(1);
  });
});
