import Anthropic from "@anthropic-ai/sdk";

export type ReplyInterpretation =
  | "confirmed"
  | "declined_wants_options"
  | "declined_with_alternative"
  | "declined_skip_week"
  | "reschedule_request"
  | "ambiguous"
  | "selecting_offered_slot"
  | "cancellation";

export type ClassifyResult = {
  interpretation: ReplyInterpretation;
  confidence: number;
  extractedDay?: string;
  extractedTime?: string;
};

export type SessionAction = {
  day: string;
  slot: string;
  action: "confirm" | "cancel" | "reschedule";
  requestedDay?: string;
  requestedTime?: string;
};

export type MultiSessionClassifyResult = {
  actions: SessionAction[];
  confidence: number;
};

export interface ConversationMessage {
  direction: "sent" | "received";
  text: string;
}

const CLASSIFY_SYSTEM = `You classify text message replies for a sports training scheduler. Respond with ONLY a JSON object, no other text.

You will be given the full conversation history between the scheduler and the client. Classify the client's MOST RECENT reply.

Categories:
- "confirmed": Client agrees to the proposed time or picks from offered alternatives ("yeah sounds good", "see you then", "Monday works", "I'll take the 3pm")
- "declined_with_alternative": Client says no to the proposed time but suggests a specific day or time ("can't do Friday, how about Monday?", "what about 5pm instead?")
- "declined_wants_options": Client says no but wants to see other available times ("that doesn't work, what else do you have?", "no, any other times?")
- "declined_skip_week": Client explicitly says they're skipping this week entirely ("not this week", "I'm away", "skip me this week", "nah I'm good, next week")
- "reschedule_request": Client wants to change but is vague about what they want ("can we move it?", "need to reschedule")
- "selecting_offered_slot": Client is picking from alternatives that were already offered ("Monday", "the 3pm one", "first option", "Wednesday at 5")
- "cancellation": Client wants to cancel an already-confirmed session ("something came up", "I can't make it", "need to cancel", "actually I won't be able to come")
- "ambiguous": Unclear or noncommittal ("let me check", "maybe", "idk")

If the client mentions a specific day or time, extract it:
{"interpretation":"declined_with_alternative","confidence":0.9,"extractedDay":"monday","extractedTime":"5pm"}

If no specific day/time is mentioned, omit those fields:
{"interpretation":"declined_wants_options","confidence":0.85}

Context matters: if the previous message offered alternatives and the client picks one, that's "selecting_offered_slot" or "confirmed", not a new reschedule request.`;

const MULTI_SESSION_CLASSIFY_SYSTEM = `You classify text message replies for a sports training scheduler. The client was offered MULTIPLE sessions for the week and is responding to all of them at once.

Respond with ONLY a JSON object containing an "actions" array. Each action corresponds to one of the offered sessions.

For each session, determine what the client wants:
- "confirm": They accept this session as-is
- "cancel": They want to skip/cancel this session
- "reschedule": They want a different time for this session (extract requestedDay/requestedTime if mentioned)

Example — client was offered Monday 3pm, Wednesday 3pm, Friday 3pm and says "Monday's good, skip Wednesday, can we do Friday at 5 instead?":
{"actions":[{"day":"monday","slot":"3pm","action":"confirm"},{"day":"wednesday","slot":"3pm","action":"cancel"},{"day":"friday","slot":"3pm","action":"reschedule","requestedTime":"5pm"}],"confidence":0.9}

Example — client says "all good":
{"actions":[{"day":"monday","slot":"3pm","action":"confirm"},{"day":"wednesday","slot":"3pm","action":"confirm"},{"day":"friday","slot":"3pm","action":"confirm"}],"confidence":0.95}

If a session isn't mentioned, assume "confirm" (the client only calls out changes).
Always include ALL offered sessions in the actions array.
Respond with ONLY the JSON object, no other text.`;

const COMPOSE_SYSTEM = `You write brief, friendly text messages for Matt, a sports performance trainer. You're texting his clients about scheduling sessions.

Rules:
- Keep messages SHORT — 1-2 sentences max, like a real text
- Sound natural and casual, like Matt texting a client he knows
- Use the client's first name occasionally but not every message
- Never make up or guess available times — only mention the specific slots provided to you
- Don't be overly formal or use exclamation marks excessively
- Vary your phrasing — don't use the same structure every time`;

export class ClassifyBillingError extends Error {
  constructor() {
    super("Anthropic API credits exhausted");
    this.name = "ClassifyBillingError";
  }
}

function formatConversation(history: ConversationMessage[]): string {
  return history.map((m) => {
    const label = m.direction === "sent" ? "Matt (scheduler)" : "Client";
    return `${label}: ${m.text}`;
  }).join("\n");
}

function checkBillingError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("credit balance") || msg.includes("billing")) {
    throw new ClassifyBillingError();
  }
}

export async function classifyReply(
  history: ConversationMessage[],
  clientReply: string,
): Promise<ClassifyResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const conversationText = history.length > 0
    ? `Conversation so far:\n${formatConversation(history)}\n\nClient's latest reply: "${clientReply}"`
    : `Client's reply: "${clientReply}"`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: conversationText }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      interpretation: parsed.interpretation ?? "ambiguous",
      confidence: parsed.confidence ?? 0.5,
      extractedDay: parsed.extractedDay ?? undefined,
      extractedTime: parsed.extractedTime ?? undefined,
    };
  } catch (e) {
    checkBillingError(e);
    console.error("Classification parse/API error, returning ambiguous:", e);
    return { interpretation: "ambiguous", confidence: 0.3 };
  }
}

export async function classifyMultiSessionReply(
  history: ConversationMessage[],
  clientReply: string,
  offeredSessions: { day: string; slot: string }[],
): Promise<MultiSessionClassifyResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const sessionList = offeredSessions.map((s) => `${s.day} at ${s.slot}`).join(", ");
  const conversationText = history.length > 0
    ? `Conversation so far:\n${formatConversation(history)}\n\nSessions offered: ${sessionList}\n\nClient's latest reply: "${clientReply}"`
    : `Sessions offered: ${sessionList}\n\nClient's reply: "${clientReply}"`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: MULTI_SESSION_CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: conversationText }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.actions || !Array.isArray(parsed.actions)) {
      return { actions: offeredSessions.map((s) => ({ ...s, action: "confirm" as const })), confidence: 0.3 };
    }

    return {
      actions: parsed.actions.map((a: Record<string, string>) => ({
        day: a.day ?? "",
        slot: a.slot ?? "",
        action: (a.action === "confirm" || a.action === "cancel" || a.action === "reschedule") ? a.action : "confirm",
        requestedDay: a.requestedDay ?? undefined,
        requestedTime: a.requestedTime ?? undefined,
      })),
      confidence: parsed.confidence ?? 0.7,
    };
  } catch (e) {
    checkBillingError(e);
    console.error("Multi-session classification failed, confirming all:", e);
    return { actions: offeredSessions.map((s) => ({ ...s, action: "confirm" as const })), confidence: 0.3 };
  }
}

export type ComposeContext = {
  firstName: string;
  history: ConversationMessage[];
  scenario:
    | { type: "confirmed"; day: string; slot: string }
    | { type: "counter_offer"; day: string; slot: string }
    | { type: "not_available"; requestLabel: string; alternatives: string }
    | { type: "already_booked"; requestLabel: string; alternatives: string }
    | { type: "alternatives"; alternatives: string }
    | { type: "skip_week" }
    | { type: "slot_taken"; alternatives: string }
    | { type: "cancellation"; day: string; slot: string }
    | { type: "late_reply" }
    | { type: "re_engage"; alternatives: string }
    | { type: "re_engage_full" }
    | { type: "multi_session_update"; summary: string }
    | { type: "clarification" };
};

export async function composeReply(ctx: ComposeContext): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let instructions: string;
  switch (ctx.scenario.type) {
    case "confirmed":
      instructions = `The client confirmed ${ctx.scenario.day} at ${ctx.scenario.slot}. Send a brief confirmation. Don't repeat unnecessary details.`;
      break;
    case "counter_offer":
      instructions = `The client asked for a different time. ${ctx.scenario.day} at ${ctx.scenario.slot} IS available. Offer it to them and ask if it works.`;
      break;
    case "not_available":
      instructions = `The client asked for ${ctx.scenario.requestLabel}, but Matt doesn't have that time slot. Available alternatives: ${ctx.scenario.alternatives}. Let them know that time doesn't work and offer the alternatives.`;
      break;
    case "already_booked":
      instructions = `The client asked for ${ctx.scenario.requestLabel}, but it's already booked. Available alternatives: ${ctx.scenario.alternatives}. Let them know it's taken and offer the alternatives.`;
      break;
    case "alternatives":
      instructions = `The client wants to see other options. Available alternatives: ${ctx.scenario.alternatives}. Offer them these times.`;
      break;
    case "skip_week":
      instructions = `The client is skipping this week. Acknowledge it briefly and let them know you'll get them in next week.`;
      break;
    case "slot_taken":
      instructions = `The slot the client picked just got booked by someone else. Available alternatives: ${ctx.scenario.alternatives}. Let them know and offer other options.`;
      break;
    case "cancellation":
      instructions = `The client is cancelling their confirmed ${ctx.scenario.day} at ${ctx.scenario.slot} session. Acknowledge the cancellation and ask if they want to reschedule for a different time this week.`;
      break;
    case "late_reply":
      instructions = `The client is replying to scheduling from a previous week that has already passed. Let them know that week is done but they'll be included in next week's scheduling.`;
      break;
    case "re_engage":
      instructions = `The client was previously moved on (no reply in time) but is now responding. Welcome them back and offer available slots: ${ctx.scenario.alternatives}.`;
      break;
    case "re_engage_full":
      instructions = `The client was previously moved on but is now responding. Unfortunately the week is fully booked now. Let them know and tell them they'll be first up next week.`;
      break;
    case "multi_session_update":
      instructions = `Summarize the scheduling update for the client. You MUST mention every change: ${ctx.scenario.summary} Include all confirmations, cancellations, and reschedule options. Don't skip any. Keep it natural but complete.`;
      break;
    case "clarification":
      instructions = `The client's reply wasn't clear. Look at the conversation context — if you just offered specific options, ask which one they meant. Keep it short and helpful, don't be robotic. Never say "let me check with Matt" — just ask the client to clarify.`;
      break;
  }

  const conversationText = ctx.history.length > 0
    ? `\n\nConversation so far:\n${formatConversation(ctx.history)}`
    : "";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: COMPOSE_SYSTEM,
      messages: [{
        role: "user",
        content: `Client name: ${ctx.firstName}${conversationText}\n\nWrite Matt's next text message. ${instructions}\n\nRespond with ONLY the text message, nothing else.`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return text.replace(/^["']|["']$/g, "").trim();
  } catch {
    return fallbackMessage(ctx);
  }
}

function fallbackMessage(ctx: ComposeContext): string {
  switch (ctx.scenario.type) {
    case "confirmed":
      return `${ctx.scenario.day} at ${ctx.scenario.slot} — you're confirmed! See you then.`;
    case "counter_offer":
      return `I have ${ctx.scenario.day} at ${ctx.scenario.slot} open — does that work?`;
    case "not_available":
      return `Sorry, I don't have ${ctx.scenario.requestLabel} this week. ${ctx.scenario.alternatives}`;
    case "already_booked":
      return `Sorry, ${ctx.scenario.requestLabel} is already booked. ${ctx.scenario.alternatives}`;
    case "alternatives":
      return ctx.scenario.alternatives;
    case "skip_week":
      return `No problem, ${ctx.firstName}. We'll get you in next week!`;
    case "slot_taken":
      return `Sorry, that slot just got booked! ${ctx.scenario.alternatives}`;
    case "cancellation":
      return `Got it, ${ctx.scenario.day} at ${ctx.scenario.slot} is cancelled. Want to reschedule for a different time this week?`;
    case "late_reply":
      return `Hey ${ctx.firstName}! That week has already passed, but I'll make sure you're included in next week's scheduling.`;
    case "re_engage":
      return `Hey ${ctx.firstName}, glad to hear from you! I still have ${ctx.scenario.alternatives} open this week if you want to get in.`;
    case "re_engage_full":
      return `Hey ${ctx.firstName}! Unfortunately this week is fully booked now, but I'll make sure you're first up next week.`;
    case "multi_session_update":
      return ctx.scenario.summary;
    case "clarification":
      return "Sorry, I didn't quite catch that — could you clarify?";
  }
}
