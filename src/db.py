import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "matt_scheduler.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "db", "schema.sql")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables from schema.sql if they don't exist."""
    conn = get_connection()
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    conn.close()
