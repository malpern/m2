import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import {
  classifyReply,
  composeReply,
  ClassifyBillingError,
  type ConversationMessage,
  type ComposeContext,
} from "./classify-reply";

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  classifyReply                                                      */
/* ------------------------------------------------------------------ */
describe("classifyReply", () => {
  function apiResponse(text: string) {
    return { content: [{ type: "text", text }] };
  }

  it("parses a simple confirmed JSON response", async () => {
    mockCreate.mockResolvedValue(
      apiResponse('{"interpretation":"confirmed","confidence":0.95}'),
    );

    const result = await classifyReply([], "yeah that works");

    expect(result).toEqual({
      interpretation: "confirmed",
      confidence: 0.95,
      extractedDay: undefined,
      extractedTime: undefined,
    });
  });

  it("parses a response with extractedDay and extractedTime", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(
        '{"interpretation":"declined_with_alternative","confidence":0.9,"extractedDay":"monday","extractedTime":"5pm"}',
      ),
    );

    const result = await classifyReply([], "can we do Monday at 5pm?");

    expect(result).toEqual({
      interpretation: "declined_with_alternative",
      confidence: 0.9,
      extractedDay: "monday",
      extractedTime: "5pm",
    });
  });

  it("strips markdown code fences from the response", async () => {
    mockCreate.mockResolvedValue(
      apiResponse(
        '```json\n{"interpretation":"ambiguous","confidence":0.6}\n```',
      ),
    );

    const result = await classifyReply([], "hmm maybe");

    expect(result.interpretation).toBe("ambiguous");
    expect(result.confidence).toBe(0.6);
  });

  it("defaults interpretation to ambiguous when missing", async () => {
    mockCreate.mockResolvedValue(apiResponse('{"confidence":0.3}'));

    const result = await classifyReply([], "???");

    expect(result.interpretation).toBe("ambiguous");
  });

  it("defaults confidence to 0.5 when missing", async () => {
    mockCreate.mockResolvedValue(
      apiResponse('{"interpretation":"confirmed"}'),
    );

    const result = await classifyReply([], "sure");

    expect(result.confidence).toBe(0.5);
  });

  it("passes full conversation history to the API", async () => {
    mockCreate.mockResolvedValue(
      apiResponse('{"interpretation":"confirmed","confidence":0.9}'),
    );

    const history: ConversationMessage[] = [
      { direction: "sent", text: "Hey, are you free Friday at 4pm?" },
      { direction: "received", text: "hmm not sure" },
      { direction: "sent", text: "How about Monday at 3pm instead?" },
    ];

    await classifyReply(history, "yeah Monday works");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const content = callArgs.messages[0].content;

    expect(content).toContain("Matt (scheduler): Hey, are you free Friday at 4pm?");
    expect(content).toContain("Client: hmm not sure");
    expect(content).toContain("Matt (scheduler): How about Monday at 3pm instead?");
    expect(content).toContain('Client\'s latest reply: "yeah Monday works"');
  });

  it("handles empty history", async () => {
    mockCreate.mockResolvedValue(
      apiResponse('{"interpretation":"confirmed","confidence":0.8}'),
    );

    await classifyReply([], "sounds good");

    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toContain('Client\'s reply: "sounds good"');
    expect(content).not.toContain("Conversation so far");
  });

  it("throws ClassifyBillingError on credit balance error", async () => {
    mockCreate.mockRejectedValue(new Error("Your credit balance is too low"));

    await expect(classifyReply([], "hey")).rejects.toThrow(ClassifyBillingError);
    await expect(classifyReply([], "hey")).rejects.toThrow(
      "Anthropic API credits exhausted",
    );
  });

  it("throws ClassifyBillingError on billing error", async () => {
    mockCreate.mockRejectedValue(new Error("billing account issue"));

    await expect(classifyReply([], "hey")).rejects.toThrow(ClassifyBillingError);
  });

  it("returns ambiguous on non-billing errors instead of throwing", async () => {
    mockCreate.mockRejectedValue(new Error("network timeout"));

    const result = await classifyReply([], "hey");
    expect(result.interpretation).toBe("ambiguous");
    expect(result.confidence).toBe(0.3);
  });

  it("returns ambiguous on JSON parse errors", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "this is not json" }],
    });

    const result = await classifyReply([], "hey");
    expect(result.interpretation).toBe("ambiguous");
    expect(result.confidence).toBe(0.3);
  });
});

/* ------------------------------------------------------------------ */
/*  composeReply                                                       */
/* ------------------------------------------------------------------ */
describe("composeReply", () => {
  function apiResponse(text: string) {
    return { content: [{ type: "text", text }] };
  }

  const baseCtx = {
    firstName: "Alex",
    history: [] as ConversationMessage[],
  };

  it("returns composed text for confirmed scenario", async () => {
    mockCreate.mockResolvedValue(apiResponse("Perfect, see you Friday at 4pm!"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "confirmed", day: "Friday", slot: "4pm" },
    });

    expect(result).toBe("Perfect, see you Friday at 4pm!");
  });

  it("returns composed text for counter_offer scenario", async () => {
    mockCreate.mockResolvedValue(apiResponse("How about Monday at 3pm?"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "counter_offer", day: "Monday", slot: "3pm" },
    });

    expect(result).toBe("How about Monday at 3pm?");
  });

  it("returns composed text for not_available scenario", async () => {
    mockCreate.mockResolvedValue(
      apiResponse("Sorry, 5pm Friday isn't available. I have Monday at 3pm or Tuesday at 4pm open."),
    );

    const result = await composeReply({
      ...baseCtx,
      scenario: {
        type: "not_available",
        requestLabel: "Friday at 5pm",
        alternatives: "Monday at 3pm, Tuesday at 4pm",
      },
    });

    expect(result).toContain("Monday at 3pm");
  });

  it("returns composed text for already_booked scenario", async () => {
    mockCreate.mockResolvedValue(
      apiResponse("That one's taken, how about Wednesday at 6pm?"),
    );

    const result = await composeReply({
      ...baseCtx,
      scenario: {
        type: "already_booked",
        requestLabel: "Monday at 3pm",
        alternatives: "Wednesday at 6pm",
      },
    });

    expect(result).toContain("Wednesday at 6pm");
  });

  it("returns composed text for alternatives scenario", async () => {
    mockCreate.mockResolvedValue(
      apiResponse("I have Tuesday at 4pm, Wednesday at 5pm open"),
    );

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "alternatives", alternatives: "Tuesday at 4pm, Wednesday at 5pm" },
    });

    expect(result).toContain("Tuesday at 4pm");
  });

  it("returns composed text for skip_week scenario", async () => {
    mockCreate.mockResolvedValue(
      apiResponse("No worries, we'll get you in next week!"),
    );

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "skip_week" },
    });

    expect(result).toContain("next week");
  });

  it("returns composed text for slot_taken scenario", async () => {
    mockCreate.mockResolvedValue(
      apiResponse("Ah that one just got booked. How about Thursday at 5pm?"),
    );

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "slot_taken", alternatives: "Thursday at 5pm" },
    });

    expect(result).toContain("Thursday at 5pm");
  });

  it("strips surrounding quotes from API response", async () => {
    mockCreate.mockResolvedValue(apiResponse('"Sounds great, see you then!"'));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "confirmed", day: "Friday", slot: "4pm" },
    });

    expect(result).toBe("Sounds great, see you then!");
  });

  it("includes conversation history in the prompt", async () => {
    mockCreate.mockResolvedValue(apiResponse("Got it, see you Monday."));

    const history: ConversationMessage[] = [
      { direction: "sent", text: "Hey, are you free Friday at 4pm?" },
      { direction: "received", text: "no can we do Monday?" },
    ];

    await composeReply({
      firstName: "Alex",
      history,
      scenario: { type: "confirmed", day: "Monday", slot: "3pm" },
    });

    const content = mockCreate.mock.calls[0][0].messages[0].content;
    expect(content).toContain("Matt (scheduler): Hey, are you free Friday at 4pm?");
    expect(content).toContain("Client: no can we do Monday?");
  });

  /* ---- fallback tests ---- */

  it("falls back to template on API failure (confirmed)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "confirmed", day: "Friday", slot: "4pm" },
    });

    expect(result).toBe("Friday at 4pm — you're confirmed! See you then.");
  });

  it("falls back to template on API failure (counter_offer)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "counter_offer", day: "Monday", slot: "3pm" },
    });

    expect(result).toBe("I have Monday at 3pm open — does that work?");
  });

  it("falls back to template on API failure (not_available)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: {
        type: "not_available",
        requestLabel: "Friday at 5pm",
        alternatives: "Monday at 3pm or Tuesday at 4pm",
      },
    });

    expect(result).toContain("Sorry, I don't have Friday at 5pm");
    expect(result).toContain("Monday at 3pm or Tuesday at 4pm");
  });

  it("falls back to template on API failure (already_booked)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: {
        type: "already_booked",
        requestLabel: "Monday at 3pm",
        alternatives: "Wednesday at 6pm",
      },
    });

    expect(result).toContain("Sorry, Monday at 3pm is already booked");
    expect(result).toContain("Wednesday at 6pm");
  });

  it("falls back to template on API failure (alternatives)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "alternatives", alternatives: "Tuesday at 4pm" },
    });

    expect(result).toBe("Tuesday at 4pm");
  });

  it("falls back to template on API failure (skip_week)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "skip_week" },
    });

    expect(result).toBe("No problem, Alex. We'll get you in next week!");
  });

  it("falls back to template on API failure (slot_taken)", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));

    const result = await composeReply({
      ...baseCtx,
      scenario: { type: "slot_taken", alternatives: "Thursday at 5pm" },
    });

    expect(result).toContain("Sorry, that slot just got booked!");
    expect(result).toContain("Thursday at 5pm");
  });
});
