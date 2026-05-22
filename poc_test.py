#!/usr/bin/env python3
"""
Phase 1 — iMessage Proof of Concept

Three tests that can be run independently:
  1. Send an iMessage to a test phone number
  2. Read recent messages from a phone number
  3. Full round-trip: send, wait for reply, interpret with Claude

Usage:
  python poc_test.py send +15551234567 "Hey, are you free Thursday at 3pm?"
  python poc_test.py read +15551234567
  python poc_test.py interpret "Are you free Thursday at 3pm?" "yeah sounds good" "TestClient"
  python poc_test.py roundtrip +15551234567 "Hey, are you free Thursday at 3pm?"
"""

import sys
import time
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def test_send(phone: str, message: str):
    from src.imessage.sender import send_imessage

    print(f"\n--- Sending iMessage ---")
    print(f"To: {phone}")
    print(f"Message: {message}")
    success = send_imessage(phone, message)
    print(f"Result: {'SUCCESS' if success else 'FAILED'}")
    return success


def test_read(phone: str):
    from src.imessage.reader import get_recent_messages

    print(f"\n--- Reading recent messages from {phone} ---")
    messages = get_recent_messages(phone, limit=5)
    if not messages:
        print("No messages found (check Full Disk Access permissions)")
        return

    for msg in messages:
        direction = "ME →" if msg.is_from_me else "← THEM"
        print(f"  [{msg.timestamp.strftime('%Y-%m-%d %H:%M')}] {direction} {msg.text}")

    return messages


def test_interpret(outreach: str, reply: str, client_name: str):
    from src.imessage.interpreter import interpret_reply

    print(f"\n--- Interpreting reply ---")
    print(f"Outreach: \"{outreach}\"")
    print(f"Reply: \"{reply}\"")
    print(f"Client: {client_name}")

    result = interpret_reply(outreach, reply, client_name)
    print(f"\nInterpretation: {result['interpretation']}")
    print(f"Confidence: {result['confidence']}")
    print(f"Suggested time: {result.get('suggested_time')}")
    print(f"Reasoning: {result['reasoning']}")
    return result


def test_roundtrip(phone: str, message: str):
    from src.imessage.sender import send_imessage
    from src.imessage.reader import get_messages_since
    from src.imessage.interpreter import interpret_reply

    print(f"\n--- Round-trip test ---")
    print(f"Sending to {phone}: \"{message}\"")

    sent_at = datetime.now(timezone.utc)
    success = send_imessage(phone, message)
    if not success:
        print("FAILED to send. Aborting.")
        return

    print("Sent. Waiting for reply (checking every 10s, timeout 5min)...")

    for i in range(30):
        time.sleep(10)
        replies = get_messages_since(phone, sent_at)
        if replies:
            reply = replies[0]
            print(f"\nReply received: \"{reply.text}\"")
            result = interpret_reply(message, reply.text, "TestClient")
            print(f"Interpretation: {result['interpretation']}")
            print(f"Confidence: {result['confidence']}")
            print(f"Reasoning: {result['reasoning']}")
            return result
        print(f"  ...no reply yet ({(i+1)*10}s)")

    print("Timed out waiting for reply.")


def test_db():
    from src.db import init_db, get_connection

    print("\n--- Database test ---")
    init_db()
    conn = get_connection()
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    print(f"Tables created: {[t['name'] for t in tables]}")
    conn.close()
    print("Database OK")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1]

    if command == "send" and len(sys.argv) >= 4:
        test_send(sys.argv[2], " ".join(sys.argv[3:]))

    elif command == "read" and len(sys.argv) >= 3:
        test_read(sys.argv[2])

    elif command == "interpret" and len(sys.argv) >= 5:
        test_interpret(sys.argv[2], sys.argv[3], sys.argv[4])

    elif command == "roundtrip" and len(sys.argv) >= 4:
        test_roundtrip(sys.argv[2], " ".join(sys.argv[3:]))

    elif command == "db":
        test_db()

    else:
        print(__doc__)


if __name__ == "__main__":
    main()
