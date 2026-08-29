/**
 * Interpreting the gym's Google Calendar (#3).
 *
 * Acuity syncs bookings into `f4lathletics@gmail.com`, so that calendar — not the
 * Acuity API — is the cheapest available record of which sessions actually
 * happened. The API is gated behind a plan upgrade; the calendar is already
 * readable.
 *
 * The rules below are derived from a month of real events, not invented:
 *
 *   84 of 168 titles matched a client exactly     e.g. "Luke Alexander"
 *    8 were semi-groups, spelled two ways         "Semi-Group" and "Semi Group"
 *    5 were a dual session                        "Jaden and Jonah"
 *   ~13 were personal life on the same calendar   "Melody Swim", "Woodhaven play date"
 *   the rest were clients absent from the database
 *
 * The calendar is a shared personal/business calendar, so the classifier must be
 * able to say "I don't know" — silently guessing would turn a family swim lesson
 * into a billable session.
 */

export type CalendarEvent = {
  title: string;
  /** ISO datetime. */
  start: string;
  end?: string;
};

export type ClientRef = { id: number; name: string };

export type Classification =
  | { kind: "client"; clientId: number; clientName: string; confidence: "exact" | "first-name" }
  | { kind: "semi-group" }
  | { kind: "dual"; names: string[] }
  | { kind: "unknown"; reason: string };

const normalise = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

const firstWord = (s: string) => normalise(s).split(" ")[0] ?? "";

/** "Semi-Group", "Semi Group", "semigroup" — all the same thing. */
function isSemiGroup(title: string): boolean {
  return normalise(title).replace(/\s/g, "").startsWith("semigroup");
}

/**
 * "Jaden and Jonah" — two clients in one session.
 *
 * Matches the same `and`/`&` signal that `classifySessionType` already uses on the
 * Sheets import, so the two paths agree about what a dual session looks like.
 */
function dualNames(title: string): string[] | null {
  const parts = String(title ?? "").split(/\s+(?:and|&)\s+/i).map((p) => p.trim()).filter(Boolean);
  return parts.length === 2 ? parts : null;
}

/**
 * Classify one calendar event.
 *
 * Only an exact full-name match is treated as confident. A first-name-only match
 * is reported with `confidence: "first-name"` so callers can route it for review
 * rather than act on it — "Melody Swim" must not silently become client Melody's
 * billable session.
 */
export function classifyEvent(event: CalendarEvent, clients: ClientRef[]): Classification {
  const title = event.title ?? "";
  if (!title.trim()) return { kind: "unknown", reason: "no title" };

  if (isSemiGroup(title)) return { kind: "semi-group" };

  const t = normalise(title);
  const exact = clients.find((c) => normalise(c.name) === t);
  if (exact) {
    return { kind: "client", clientId: exact.id, clientName: exact.name, confidence: "exact" };
  }

  const dual = dualNames(title);
  if (dual) return { kind: "dual", names: dual };

  // Ambiguous by design: only a UNIQUE first-name match is worth surfacing, and
  // even then only for review. Two clients called Jack means we know nothing.
  const fn = firstWord(title);
  if (fn) {
    const byFirst = clients.filter((c) => firstWord(c.name) === fn);
    if (byFirst.length === 1) {
      return {
        kind: "client",
        clientId: byFirst[0].id,
        clientName: byFirst[0].name,
        confidence: "first-name",
      };
    }
    if (byFirst.length > 1) {
      return { kind: "unknown", reason: `"${fn}" matches ${byFirst.length} clients` };
    }
  }

  return { kind: "unknown", reason: "no matching client" };
}

/** Convenience: classify a batch and bucket it, for a summary view. */
export function classifyAll(events: CalendarEvent[], clients: ClientRef[]) {
  const out = {
    exact: [] as { event: CalendarEvent; c: Classification }[],
    needsReview: [] as { event: CalendarEvent; c: Classification }[],
    semiGroup: [] as CalendarEvent[],
    dual: [] as { event: CalendarEvent; names: string[] }[],
    unknown: [] as { event: CalendarEvent; reason: string }[],
  };
  for (const event of events) {
    const c = classifyEvent(event, clients);
    if (c.kind === "client" && c.confidence === "exact") out.exact.push({ event, c });
    else if (c.kind === "client") out.needsReview.push({ event, c });
    else if (c.kind === "semi-group") out.semiGroup.push(event);
    else if (c.kind === "dual") out.dual.push({ event, names: c.names });
    else out.unknown.push({ event, reason: c.reason });
  }
  return out;
}
