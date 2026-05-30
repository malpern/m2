import Anthropic from "@anthropic-ai/sdk";

export type ReplyInterpretation =
  | "confirmed"
  | "declined_wants_options"
  | "declined_with_alternative"
  | "declined_skip_week"
  | "reschedule_request"
  | "ambiguous"
  | "selecting_offered_slot";

export type ClassifyResult = {
  interpretation: ReplyInterpretation;
  confidence: number;
  extractedDay?: string;
  extractedTime?: string;
};

const SYSTEM_PROMPT = `You classify text message replies for a sports training scheduler. Respond with ONLY a JSON object, no other text.

Categories:
- "confirmed": Client agrees to the proposed time or picks from offered alternatives ("yeah sounds good", "see you then", "Monday works", "I'll take the 3pm")
- "declined_with_alternative": Client says no to the proposed time but suggests a specific day or time ("can't do Friday, how about Monday?", "what about 5pm instead?")
- "declined_wants_options": Client says no but wants to see other available times ("that doesn't work, what else do you have?", "no, any other times?")
- "declined_skip_week": Client explicitly says they're skipping this week entirely ("not this week", "I'm away", "skip me this week", "nah I'm good, next week")
- "reschedule_request": Client wants to change but is vague about what they want ("can we move it?", "need to reschedule")
- "selecting_offered_slot": Client is picking from alternatives that were already offered ("Monday", "the 3pm one", "first option", "Wednesday at 5")
- "ambiguous": Unclear or noncommittal ("let me check", "maybe", "idk")

If the client mentions a specific day or time, extract it:
{"interpretation":"declined_with_alternative","confidence":0.9,"extractedDay":"monday","extractedTime":"5pm"}

If no specific day/time is mentioned, omit those fields:
{"interpretation":"declined_wants_options","confidence":0.85}

Context matters: if the original message offered alternatives and the client picks one, that's "selecting_offered_slot" or "confirmed", not a new reschedule request.`;

export class ClassifyBillingError extends Error {
  constructor() {
    super("Anthropic API credits exhausted");
    this.name = "ClassifyBillingError";
  }
}

export async function classifyReply(
  outreachMessage: string,
  clientReply: string,
): Promise<ClassifyResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Original message sent to client: "${outreachMessage}"\nClient's reply: "${clientReply}"`,
      }],
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
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("credit balance") || msg.includes("billing")) {
      throw new ClassifyBillingError();
    }
    throw e;
  }
}
