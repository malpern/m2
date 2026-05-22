import json

import anthropic
import logging

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an assistant that interprets client text message replies
for a sports training scheduler. Your job is to classify the client's response
into one of these categories:

- confirmed: Client clearly agrees to the proposed time
- declined: Client cannot make it and is not suggesting an alternative
- reschedule: Client wants a different time or day
- ambiguous: Client is uncertain, noncommittal, or you can't tell

Respond with a JSON object containing:
- "interpretation": one of "confirmed", "declined", "reschedule", "ambiguous"
- "suggested_time": if interpretation is "reschedule", extract the requested time/day (null otherwise)
- "confidence": float 0-1 for how confident you are
- "reasoning": one sentence explaining your read

Examples of confirmed: "yes", "sounds good", "see you then", "perfect", "I'll be there"
Examples of declined: "can't make it", "I'm out this week", "no"
Examples of reschedule: "can we do 5 instead?", "what about Thursday?", "is 6pm open?"
Examples of ambiguous: "maybe", "let me check", "I'll let you know", "not sure yet"
"""


def interpret_reply(
    outreach_message: str,
    client_reply: str,
    client_name: str,
) -> dict:
    """Use Claude to interpret a client's text reply to a scheduling message."""
    client = anthropic.Anthropic()

    user_prompt = (
        f"Client name: {client_name}\n"
        f"Outreach message sent: \"{outreach_message}\"\n"
        f"Client replied: \"{client_reply}\"\n\n"
        f"Classify this reply."
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = response.content[0].text
        # Handle markdown code blocks
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)

    except json.JSONDecodeError:
        logger.error(f"Failed to parse Claude response: {response.content[0].text}")
        return {
            "interpretation": "ambiguous",
            "suggested_time": None,
            "confidence": 0.0,
            "reasoning": "Failed to parse AI response",
        }
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        return {
            "interpretation": "ambiguous",
            "suggested_time": None,
            "confidence": 0.0,
            "reasoning": f"API error: {e}",
        }
