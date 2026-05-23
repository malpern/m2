CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'active'
        CHECK (category IN ('active', 'inactive', 'in_season', 'on_break', 'vacation')),
    grade_level TEXT
        CHECK (grade_level IN ('freshman', 'sophomore', 'junior', 'senior', 'post_grad')),
    college_bound BOOLEAN NOT NULL DEFAULT 0,
    behavior_score INTEGER NOT NULL DEFAULT 5
        CHECK (behavior_score BETWEEN 1 AND 10),
    preferred_days TEXT,  -- JSON array, e.g. '["monday", "wednesday"]'
    preferred_time TEXT,  -- e.g. "after_3pm", "5pm", "flexible"
    max_sessions_per_week INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    acuity_package_id TEXT,
    total_sessions INTEGER NOT NULL,
    sessions_used INTEGER NOT NULL DEFAULT 0,
    sessions_remaining INTEGER GENERATED ALWAYS AS (total_sessions - sessions_used) STORED,
    purchase_date DATE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'exhausted', 'unpaid')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    package_id INTEGER REFERENCES packages(id),
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('3pm', '4pm', '5pm', '6pm', '7pm')),
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'confirmed', 'completed', 'cancelled', 'no_show')),
    gcal_event_id TEXT,
    logged_to_sheets BOOLEAN NOT NULL DEFAULT 0,
    reconciled BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    session_id INTEGER REFERENCES sessions(id),
    week_of DATE NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
    message_text TEXT NOT NULL,
    interpretation TEXT
        CHECK (interpretation IN ('confirmed', 'declined', 'ambiguous', 'reschedule_request')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'awaiting_reply', 'confirmed', 'needs_matt', 'expired')),
    sent_at TIMESTAMP,
    replied_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_reconciled ON sessions(reconciled) WHERE reconciled = 0;
CREATE INDEX IF NOT EXISTS idx_outreach_week ON outreach(week_of);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach(status);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status) WHERE status = 'active';
