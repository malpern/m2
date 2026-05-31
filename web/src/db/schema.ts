import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  category: text("category", {
    enum: ["active", "inactive", "in_season", "on_break", "vacation"],
  })
    .notNull()
    .default("active"),
  gradeLevel: text("grade_level", {
    enum: ["freshman", "sophomore", "junior", "senior", "post_grad", "adult"],
  }),
  collegeBound: integer("college_bound", { mode: "boolean" })
    .notNull()
    .default(false),
  behaviorScore: integer("behavior_score").notNull().default(5),
  noShowCount: integer("no_show_count").notNull().default(0),
  preferredDays: text("preferred_days"),
  preferredTime: text("preferred_time"),
  maxSessionsPerWeek: integer("max_sessions_per_week").notNull().default(1),
  standingSlot: text("standing_slot"),
  sortOrder: integer("sort_order"),
  notes: text("notes"),
  googleSheetsName: text("google_sheets_name"),
  sessionRate: integer("session_rate"),
  sessionType: text("session_type", {
    enum: ["individual", "dual", "group"],
  }),
  parentGuardian: text("parent_guardian"),
  email: text("email"),
  calendarInviteOptIn: integer("calendar_invite_opt_in", { mode: "boolean" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const packages = sqliteTable("packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  acuityPackageId: text("acuity_package_id"),
  totalSessions: integer("total_sessions").notNull(),
  sessionsUsed: integer("sessions_used").notNull().default(0),
  purchaseDate: text("purchase_date"),
  status: text("status", {
    enum: ["active", "exhausted", "unpaid"],
  })
    .notNull()
    .default("active"),
  pricePerSession: integer("price_per_session"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const packageTransactions = sqliteTable("package_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  packageId: integer("package_id")
    .notNull()
    .references(() => packages.id),
  sessionId: integer("session_id").references(() => sessions.id),
  delta: integer("delta").notNull(),
  reason: text("reason", {
    enum: ["completed", "cancelled", "manual_adjustment"],
  }).notNull(),
  previousBalance: integer("previous_balance").notNull(),
  newBalance: integer("new_balance").notNull(),
  note: text("note"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  packageId: integer("package_id").references(() => packages.id),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  slot: text("slot", {
    enum: ["3pm", "4pm", "5pm", "6pm", "7pm"],
  }).notNull(),
  status: text("status", {
    enum: ["proposed", "confirmed", "completed", "cancelled", "no_show"],
  })
    .notNull()
    .default("proposed"),
  sessionType: text("session_type", {
    enum: ["individual", "group", "late_cancel"],
  }),
  gcalEventId: text("gcal_event_id"),
  loggedToSheets: integer("logged_to_sheets", { mode: "boolean" })
    .notNull()
    .default(false),
  reconciled: integer("reconciled", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const guideFeedback = sqliteTable("guide_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  xPercent: integer("x_percent").notNull(),
  yPixels: integer("y_pixels").notNull(),
  sectionId: text("section_id"),
  feedbackText: text("feedback_text").notNull(),
  githubIssueNumber: integer("github_issue_number").notNull(),
  githubIssueUrl: text("github_issue_url").notNull(),
  issueState: text("issue_state", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const outreach = sqliteTable("outreach", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  sessionId: integer("session_id").references(() => sessions.id),
  weekOf: text("week_of").notNull(),
  direction: text("direction", { enum: ["sent", "received"] }).notNull(),
  messageText: text("message_text").notNull(),
  interpretation: text("interpretation", {
    enum: ["confirmed", "declined", "ambiguous", "reschedule_request", "declined_wants_options", "declined_with_alternative", "declined_skip_week", "selecting_offered_slot", "cancellation"],
  }),
  status: text("status", {
    enum: ["pending", "awaiting_reply", "confirmed", "needs_matt", "expired"],
  })
    .notNull()
    .default("pending"),
  sentAt: text("sent_at"),
  repliedAt: text("replied_at"),
  sendError: text("send_error"),
  outreachGroupId: text("outreach_group_id"),
});

export const defaultAvailability = sqliteTable("default_availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  day: text("day", {
    enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"],
  }).notNull(),
  slot: text("slot").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const weeklyOverrides = sqliteTable("weekly_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekOf: text("week_of").notNull(),
  day: text("day", {
    enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"],
  }).notNull(),
  slot: text("slot").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  note: text("note"),
});

export const prioritySettings = sqliteTable("priority_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collegeBoundWeight: integer("college_bound_weight").notNull().default(5),
  gradeLevelWeight: integer("grade_level_weight").notNull().default(3),
  effortWeight: integer("effort_weight").notNull().default(2),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const outreachSettings = sqliteTable("outreach_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  wave1Size: integer("wave1_size").notNull().default(8),
  wave2DelayMinutes: integer("wave2_delay_minutes").notNull().default(45),
  wave3DelayMinutes: integer("wave3_delay_minutes").notNull().default(120),
  followUpAfterMinutes: integer("follow_up_after_minutes").notNull().default(60),
  moveOnAfterMinutes: integer("move_on_after_minutes").notNull().default(180),
  outreachDay: text("outreach_day").notNull().default("saturday"),
  outreachHour: integer("outreach_hour").notNull().default(9),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const googleTokens = sqliteTable("google_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: text("expires_at").notNull(),
  email: text("email"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  severity: text("severity", { enum: ["info", "warn", "error"] }).notNull(),
  category: text("category", {
    enum: ["classifier", "twilio", "outreach", "auto_fill", "cron", "webhook", "system"],
  }).notNull(),
  mattMessage: text("matt_message").notNull(),
  technicalMessage: text("technical_message").notNull(),
  metadata: text("metadata"),
  clientId: integer("client_id"),
  sessionId: integer("session_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const weeklySkips = sqliteTable("weekly_skips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  weekOf: text("week_of").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type Client = typeof clients.$inferSelect;
export type PrioritySettingsRow = typeof prioritySettings.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Outreach = typeof outreach.$inferSelect;
export type WeeklySkip = typeof weeklySkips.$inferSelect;
