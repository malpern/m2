import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You classify text message replies for a sports training scheduler. Respond with ONLY a JSON object, no other text.

Categories:
- "confirmed": Client agrees to the proposed time
- "declined": Client cannot make it
- "reschedule_request": Client wants a different time
- "ambiguous": Unclear or noncommittal

Response format:
{"interpretation":"confirmed","confidence":0.95}

Examples:
"yeah sounds good" → confirmed
"can't make it" → declined
"can we do 5 instead?" → reschedule_request
"let me check" → ambiguous
"see you then" → confirmed
"nah not this week" → declined
"what about Friday?" → reschedule_request
"maybe" → ambiguous`;

export async function classifyReply(
  outreachMessage: string,
  clientReply: string,
): Promise<{ interpretation: "confirmed" | "declined" | "reschedule_request" | "ambiguous"; confidence: number }> {
  // Fast keyword fallback if no API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return keywordClassify(clientReply);
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Original message: "${outreachMessage}"\nReply: "${clientReply}"`,
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      interpretation: parsed.interpretation ?? "ambiguous",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (e) {
    console.error("Claude classification failed, using keyword fallback:", e);
    return keywordClassify(clientReply);
  }
}

function keywordClassify(reply: string): { interpretation: "confirmed" | "declined" | "reschedule_request" | "ambiguous"; confidence: number } {
  const lower = reply.toLowerCase().trim();

  if (/^(yes|yeah|yep|yup|sure|sounds good|see you|perfect|ok|okay|i'm in|let's do it|confirmed|down|bet|absolutely|for sure|works for me|i'll be there)/i.test(lower)) {
    return { interpretation: "confirmed", confidence: 0.8 };
  }
  if (/^(no|nah|can't|cant|not this week|pass|skip|i'm out|busy|won't make it)/i.test(lower)) {
    return { interpretation: "declined", confidence: 0.8 };
  }
  if (/instead|different|switch|change|move|reschedule|how about|what about|can we do|another time|later/i.test(lower)) {
    return { interpretation: "reschedule_request", confidence: 0.7 };
  }
  return { interpretation: "ambiguous", confidence: 0.3 };
}
