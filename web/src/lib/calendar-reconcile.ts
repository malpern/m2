import { classifyEvent, type CalendarEvent, type ClientRef } from "./calendar-match";

/**
 * Reconcile the gym calendar against what m2 recorded (#3).
 *
 * The issue's target is "2-3 missed deductions per month": a session that
 * happened but was never deducted from the client's package. The calendar is the
 * record of what happened; m2 is the record of what was billed. The gap between
 * them is the answer.
 *
 * Deliberately produces a REPORT and changes nothing. A calendar entry is not
 * proof a session was delivered — plans change and the calendar is not always
 * updated — so an automatic deduction would create the mirror-image error of the
 * one being fixed, and a wrong deduction is worse than a missed one because
 * nobody goes looking for it.
 */

export type AppSession = {
  id: number;
  clientId: number;
  clientName: string;
  /** YYYY-MM-DD */
  scheduledDate: string;
  /** HH:MM, 24-hour */
  scheduledTime: string;
  status: string;
};

export type Discrepancy =
  /** On the calendar, nothing in m2 — the likely missed deduction. */
  | { type: "missing_from_app"; when: string; title: string; clientId: number; clientName: string }
  /** In m2 as happening, absent from the calendar — may never have taken place. */
  | { type: "missing_from_calendar"; when: string; sessionId: number; clientName: string; status: string }
  /** Recognised as a session but not confidently attributable to a client. */
  | { type: "needs_review"; when: string; title: string; reason: string };

export type ReconcileResult = {
  matched: number;
  discrepancies: Discrepancy[];
  /** Events deliberately not treated as sessions (personal life, unknown names). */
  ignored: { when: string; title: string; reason: string }[];
  counts: { missingFromApp: number; missingFromCalendar: number; needsReview: number; ignored: number };
};

/** Statuses that assert the session actually happened. */
const HAPPENED = new Set(["completed", "confirmed"]);

const dayOf = (iso: string) => iso.slice(0, 10);
const hhmm = (iso: string) => {
  // Calendar times carry an offset; compare on the local wall-clock time, which
  // is what m2 stores. Slicing the ISO string keeps it in the event's own zone
  // rather than shifting it into the runtime's.
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
};

const key = (date: string, time: string, clientId: number) => `${date}|${time}|${clientId}`;

export function reconcile(
  events: CalendarEvent[],
  sessions: AppSession[],
  clients: ClientRef[],
): ReconcileResult {
  const discrepancies: Discrepancy[] = [];
  const ignored: ReconcileResult["ignored"] = [];

  const appByKey = new Map<string, AppSession>();
  for (const s of sessions) {
    if (!HAPPENED.has(s.status)) continue;
    appByKey.set(key(s.scheduledDate, s.scheduledTime, s.clientId), s);
  }

  const seen = new Set<string>();
  let matched = 0;

  for (const e of events) {
    const c = classifyEvent(e, clients);
    const when = `${dayOf(e.start)} ${hhmm(e.start)}`;

    if (c.kind === "client" && c.confidence === "exact") {
      const k = key(dayOf(e.start), hhmm(e.start), c.clientId);
      const hit = appByKey.get(k);
      if (hit) {
        matched++;
        seen.add(k);
      } else {
        discrepancies.push({
          type: "missing_from_app",
          when,
          title: e.title,
          clientId: c.clientId,
          clientName: c.clientName,
        });
      }
      continue;
    }

    if (c.kind === "client") {
      // First-name only: real enough to show Matt, never acted on automatically.
      discrepancies.push({
        type: "needs_review",
        when,
        title: e.title,
        reason: `possibly ${c.clientName} — first name only`,
      });
      continue;
    }

    if (c.kind === "semi-group") {
      ignored.push({ when, title: e.title, reason: "semi-group — roster lives in the app (#13)" });
      continue;
    }
    if (c.kind === "dual") {
      ignored.push({ when, title: e.title, reason: "dual session — two clients, not yet modelled" });
      continue;
    }
    ignored.push({ when, title: e.title, reason: c.reason });
  }

  // Sessions m2 believes happened, with nothing on the calendar to support them.
  for (const [k, s] of appByKey) {
    if (seen.has(k)) continue;
    discrepancies.push({
      type: "missing_from_calendar",
      when: `${s.scheduledDate} ${s.scheduledTime}`,
      sessionId: s.id,
      clientName: s.clientName,
      status: s.status,
    });
  }

  discrepancies.sort((a, b) => a.when.localeCompare(b.when));

  return {
    matched,
    discrepancies,
    ignored,
    counts: {
      missingFromApp: discrepancies.filter((d) => d.type === "missing_from_app").length,
      missingFromCalendar: discrepancies.filter((d) => d.type === "missing_from_calendar").length,
      needsReview: discrepancies.filter((d) => d.type === "needs_review").length,
      ignored: ignored.length,
    },
  };
}
