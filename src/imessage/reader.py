import sqlite3
import os
from datetime import datetime, timezone
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

CHAT_DB_PATH = os.path.expanduser("~/Library/Messages/chat.db")

# Apple's Core Data epoch: 2001-01-01 00:00:00 UTC
APPLE_EPOCH_OFFSET = 978307200


@dataclass
class Message:
    rowid: int
    phone: str
    text: str
    is_from_me: bool
    timestamp: datetime


def _apple_timestamp_to_datetime(ns_timestamp: int) -> datetime:
    """Convert Apple's nanosecond Core Data timestamp to a datetime."""
    unix_seconds = (ns_timestamp / 1_000_000_000) + APPLE_EPOCH_OFFSET
    return datetime.fromtimestamp(unix_seconds, tz=timezone.utc)


def get_recent_messages(phone_number: str, limit: int = 10) -> list[Message]:
    """Read recent messages from/to a phone number via the Messages SQLite DB."""
    if not os.path.exists(CHAT_DB_PATH):
        logger.error(f"Messages database not found at {CHAT_DB_PATH}")
        return []

    try:
        conn = sqlite3.connect(f"file:{CHAT_DB_PATH}?mode=ro", uri=True)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                m.ROWID,
                h.id AS phone,
                m.text,
                m.is_from_me,
                m.date
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            WHERE h.id LIKE ?
            AND m.text IS NOT NULL
            ORDER BY m.date DESC
            LIMIT ?
        """, (f"%{phone_number[-10:]}%", limit))

        messages = []
        for row in cursor.fetchall():
            messages.append(Message(
                rowid=row[0],
                phone=row[1],
                text=row[2],
                is_from_me=bool(row[3]),
                timestamp=_apple_timestamp_to_datetime(row[4]),
            ))

        conn.close()
        messages.reverse()
        return messages

    except sqlite3.OperationalError as e:
        logger.error(f"Cannot read Messages DB (need Full Disk Access): {e}")
        return []
    except Exception as e:
        logger.error(f"Error reading messages: {e}")
        return []


def get_messages_since(phone_number: str, since: datetime) -> list[Message]:
    """Get all messages from a phone number since a given datetime."""
    if not os.path.exists(CHAT_DB_PATH):
        logger.error(f"Messages database not found at {CHAT_DB_PATH}")
        return []

    since_apple_ns = int(
        (since.timestamp() - APPLE_EPOCH_OFFSET) * 1_000_000_000
    )

    try:
        conn = sqlite3.connect(f"file:{CHAT_DB_PATH}?mode=ro", uri=True)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                m.ROWID,
                h.id AS phone,
                m.text,
                m.is_from_me,
                m.date
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            WHERE h.id LIKE ?
            AND m.is_from_me = 0
            AND m.text IS NOT NULL
            AND m.date > ?
            ORDER BY m.date ASC
        """, (f"%{phone_number[-10:]}%", since_apple_ns))

        messages = []
        for row in cursor.fetchall():
            messages.append(Message(
                rowid=row[0],
                phone=row[1],
                text=row[2],
                is_from_me=bool(row[3]),
                timestamp=_apple_timestamp_to_datetime(row[4]),
            ))

        conn.close()
        return messages

    except sqlite3.OperationalError as e:
        logger.error(f"Cannot read Messages DB (need Full Disk Access): {e}")
        return []
    except Exception as e:
        logger.error(f"Error reading messages: {e}")
        return []
