"""Generate and send outreach messages, prefixed with client first name."""

import logging
from src.db import get_connection
from src.imessage.sender import send_imessage

logger = logging.getLogger(__name__)


def get_first_name(full_name: str) -> str:
    return full_name.split()[0]


def build_outreach_message(client_name: str, day: str, time: str) -> str:
    first = get_first_name(client_name)
    return f"{first}: Hey, are you free {day} at {time} for a session?"


def get_clients_by_priority() -> list[dict]:
    """Return active/in-season clients sorted by Matt's priority rules."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT c.*, p.sessions_remaining
        FROM clients c
        LEFT JOIN packages p ON p.client_id = c.id AND p.status = 'active'
        WHERE c.category IN ('active', 'in_season')
        ORDER BY c.college_bound DESC,
                 CASE c.grade_level
                     WHEN 'senior' THEN 4
                     WHEN 'junior' THEN 3
                     WHEN 'sophomore' THEN 2
                     WHEN 'freshman' THEN 1
                     ELSE 0
                 END DESC,
                 c.behavior_score DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def send_outreach(client_name: str, phone: str, day: str, time: str) -> bool:
    """Send a scheduling outreach message to a client."""
    message = build_outreach_message(client_name, day, time)
    logger.info(f"Outreach to {client_name}: {message}")
    return send_imessage(phone, message)
