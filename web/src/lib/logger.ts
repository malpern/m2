import { db } from "@/db";
import { systemLogs } from "@/db/schema";

type Severity = "info" | "warn" | "error";
type Category = "classifier" | "twilio" | "outreach" | "auto_fill" | "cron" | "webhook" | "system";

interface LogEntry {
  severity: Severity;
  category: Category;
  matt: string;
  technical: string;
  metadata?: Record<string, unknown>;
  clientId?: number | null;
  sessionId?: number | null;
}

export async function log(entry: LogEntry): Promise<void> {
  const consoleFn = entry.severity === "error" ? console.error
    : entry.severity === "warn" ? console.warn
    : console.log;

  consoleFn(`[${entry.severity.toUpperCase()}] [${entry.category}] ${entry.technical}`);

  try {
    await db.insert(systemLogs).values({
      severity: entry.severity,
      category: entry.category,
      mattMessage: entry.matt,
      technicalMessage: entry.technical,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      clientId: entry.clientId ?? null,
      sessionId: entry.sessionId ?? null,
    }).run();
  } catch (e) {
    console.error("Failed to write log entry:", e);
  }
}

export const syslog = {
  info: (category: Category, matt: string, technical: string, opts?: Partial<LogEntry>) =>
    log({ severity: "info", category, matt, technical, ...opts }),

  warn: (category: Category, matt: string, technical: string, opts?: Partial<LogEntry>) =>
    log({ severity: "warn", category, matt, technical, ...opts }),

  error: (category: Category, matt: string, technical: string, opts?: Partial<LogEntry>) => {
    const promise = log({ severity: "error", category, matt, technical, ...opts });
    promise.then(() => {
      import("./alerting").then(({ checkAndAlert }) => checkAndAlert(matt, technical)).catch((e) =>
        console.error("Failed to run alerting check:", e instanceof Error ? e.message : String(e))
      );
    });
    return promise;
  },
};
