CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'active',
    grade_level TEXT,
    college_bound INTEGER NOT NULL DEFAULT 0,
    behavior_score INTEGER NOT NULL DEFAULT 5,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    preferred_days TEXT,
    preferred_time TEXT,
    max_sessions_per_week INTEGER NOT NULL DEFAULT 1,
    standing_slot TEXT,
    sort_order INTEGER,
    notes TEXT,
    google_sheets_name TEXT,
    session_rate INTEGER,
    session_type TEXT,
    parent_guardian TEXT,
    email TEXT,
    calendar_invite_opt_in INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    acuity_package_id TEXT,
    total_sessions INTEGER NOT NULL,
    sessions_used INTEGER NOT NULL DEFAULT 0,
    purchase_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    price_per_session INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    package_id INTEGER REFERENCES packages(id),
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    slot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    session_type TEXT,
    gcal_event_id TEXT,
    logged_to_sheets INTEGER NOT NULL DEFAULT 0,
    reconciled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    session_id INTEGER REFERENCES sessions(id),
    week_of TEXT NOT NULL,
    direction TEXT NOT NULL,
    message_text TEXT NOT NULL,
    interpretation TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TEXT,
    replied_at TEXT,
    send_error TEXT,
    outreach_group_id TEXT
);

CREATE TABLE priority_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_bound_weight INTEGER NOT NULL DEFAULT 5,
    grade_level_weight INTEGER NOT NULL DEFAULT 3,
    effort_weight INTEGER NOT NULL DEFAULT 2,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE default_availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE weekly_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_of TEXT NOT NULL,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    note TEXT
);

CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    severity TEXT NOT NULL,
    category TEXT NOT NULL,
    matt_message TEXT NOT NULL,
    technical_message TEXT NOT NULL,
    metadata TEXT,
    client_id INTEGER,
    session_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
