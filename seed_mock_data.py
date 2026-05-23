#!/usr/bin/env python3
"""Seed the database with mock clients for testing. All use Matt's phone number."""

from src.db import init_db, get_connection

MATT_PHONE = "+14083900506"

MOCK_CLIENTS = [
    {
        "name": "Jake Rivera",
        "phone": MATT_PHONE,
        "category": "in_season",
        "grade_level": "senior",
        "college_bound": True,
        "behavior_score": 9,
        "preferred_days": '["monday", "wednesday"]',
        "preferred_time": "3pm",
        "max_sessions_per_week": 2,
        "notes": "Top recruit. Committed to training. Wants D1.",
    },
    {
        "name": "Sofia Chen",
        "phone": MATT_PHONE,
        "category": "in_season",
        "grade_level": "junior",
        "college_bound": True,
        "behavior_score": 8,
        "preferred_days": '["tuesday", "thursday"]',
        "preferred_time": "3pm",
        "max_sessions_per_week": 2,
        "notes": "Strong work ethic. Targeting D2 programs.",
    },
    {
        "name": "Tyler Brooks",
        "phone": MATT_PHONE,
        "category": "active",
        "grade_level": "senior",
        "college_bound": False,
        "behavior_score": 7,
        "preferred_days": '["monday", "friday"]',
        "preferred_time": "5pm",
        "max_sessions_per_week": 1,
        "notes": "Consistent but not pursuing college ball.",
    },
    {
        "name": "Mia Patterson",
        "phone": MATT_PHONE,
        "category": "active",
        "grade_level": "sophomore",
        "college_bound": False,
        "behavior_score": 6,
        "preferred_days": '["wednesday", "friday"]',
        "preferred_time": "5pm",
        "max_sessions_per_week": 1,
        "notes": "Good attitude. Still developing.",
    },
    {
        "name": "Dylan Ward",
        "phone": MATT_PHONE,
        "category": "in_season",
        "grade_level": "junior",
        "college_bound": True,
        "behavior_score": 5,
        "preferred_days": '["tuesday", "thursday"]',
        "preferred_time": "3pm",
        "max_sessions_per_week": 1,
        "notes": "Says he wants college but inconsistent follow-through.",
    },
    {
        "name": "Emma Lawson",
        "phone": MATT_PHONE,
        "category": "active",
        "grade_level": "freshman",
        "college_bound": False,
        "behavior_score": 8,
        "preferred_days": '["wednesday"]',
        "preferred_time": "6pm",
        "max_sessions_per_week": 1,
        "notes": "New but eager. Great effort every session.",
    },
    {
        "name": "Carlos Gutierrez",
        "phone": MATT_PHONE,
        "category": "on_break",
        "grade_level": "senior",
        "college_bound": False,
        "behavior_score": 4,
        "preferred_days": '["friday"]',
        "preferred_time": "flexible",
        "max_sessions_per_week": 1,
        "notes": "Taking a break. Check back in a few weeks.",
    },
    {
        "name": "Ava Simmons",
        "phone": MATT_PHONE,
        "category": "active",
        "grade_level": "junior",
        "college_bound": False,
        "behavior_score": 7,
        "preferred_days": '["monday", "thursday"]',
        "preferred_time": "5pm",
        "max_sessions_per_week": 1,
        "notes": "Reliable. Always on time.",
    },
]

MOCK_PACKAGES = [
    {"client_name": "Jake Rivera", "total_sessions": 20, "sessions_used": 12, "status": "active"},
    {"client_name": "Sofia Chen", "total_sessions": 10, "sessions_used": 7, "status": "active"},
    {"client_name": "Tyler Brooks", "total_sessions": 10, "sessions_used": 9, "status": "active"},
    {"client_name": "Mia Patterson", "total_sessions": 10, "sessions_used": 3, "status": "active"},
    {"client_name": "Dylan Ward", "total_sessions": 10, "sessions_used": 5, "status": "active"},
    {"client_name": "Emma Lawson", "total_sessions": 5, "sessions_used": 1, "status": "active"},
    {"client_name": "Ava Simmons", "total_sessions": 10, "sessions_used": 6, "status": "active"},
    {"client_name": "Carlos Gutierrez", "total_sessions": 10, "sessions_used": 4, "status": "active"},
]


def seed():
    init_db()
    conn = get_connection()

    conn.execute("DELETE FROM outreach")
    conn.execute("DELETE FROM sessions")
    conn.execute("DELETE FROM packages")
    conn.execute("DELETE FROM clients")

    for c in MOCK_CLIENTS:
        conn.execute("""
            INSERT INTO clients (name, phone, category, grade_level, college_bound,
                behavior_score, preferred_days, preferred_time, max_sessions_per_week, notes)
            VALUES (:name, :phone, :category, :grade_level, :college_bound,
                :behavior_score, :preferred_days, :preferred_time, :max_sessions_per_week, :notes)
        """, c)

    for p in MOCK_PACKAGES:
        client_id = conn.execute(
            "SELECT id FROM clients WHERE name = ?", (p["client_name"],)
        ).fetchone()["id"]
        conn.execute("""
            INSERT INTO packages (client_id, total_sessions, sessions_used, status)
            VALUES (?, ?, ?, ?)
        """, (client_id, p["total_sessions"], p["sessions_used"], p["status"]))

    conn.commit()

    print("Seeded mock data:\n")
    rows = conn.execute("""
        SELECT c.name, c.category, c.grade_level, c.college_bound, c.behavior_score,
               p.sessions_remaining, c.preferred_time
        FROM clients c
        LEFT JOIN packages p ON p.client_id = c.id AND p.status = 'active'
        ORDER BY c.college_bound DESC,
                 CASE c.grade_level
                     WHEN 'senior' THEN 4
                     WHEN 'junior' THEN 3
                     WHEN 'sophomore' THEN 2
                     WHEN 'freshman' THEN 1
                 END DESC,
                 c.behavior_score DESC
    """).fetchall()

    print(f"{'Name':<22} {'Category':<12} {'Grade':<12} {'College':<8} {'Score':<6} {'Remaining':<10} {'Time'}")
    print("-" * 90)
    for r in rows:
        college = "YES" if r["college_bound"] else ""
        print(f"{r['name']:<22} {r['category']:<12} {r['grade_level'] or '':<12} {college:<8} {r['behavior_score']:<6} {r['sessions_remaining'] or 'n/a':<10} {r['preferred_time']}")

    conn.close()


if __name__ == "__main__":
    seed()
