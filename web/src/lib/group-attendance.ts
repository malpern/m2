/**
 * Semi-group attendance (#13).
 *
 * A session row has one `clientId`, which is the wrong shape for a semi-group.
 * Neither existing source records participants: Google Calendar events are owned
 * by the trainer with no client names, and Sheets logs only a head count
 * ("2 attended"). `session_attendees` fills that gap.
 *
 * The rules here are about reconciling two representations of the same fact —
 * the session's owning client, and the attendee rows — into one roster without
 * double-counting or losing anybody.
 */

export type AttendeeRow = { clientId: number; clientName: string };

export type GroupSession = {
  sessionId: number;
  /** The client the session row belongs to. Always part of the roster. */
  ownerClientId: number;
  ownerClientName: string;
  attendees: AttendeeRow[];
};

export type Roster = {
  sessionId: number;
  members: AttendeeRow[];
  /** What Sheets calls "N attended". */
  headCount: number;
};

/**
 * The full roster for a session: the owning client plus everyone recorded as an
 * attendee, de-duplicated.
 *
 * The owner is included because the session belongs to them — they are attending
 * by definition, and leaving them out would make a two-person semi-group report a
 * head count of one. They are also de-duplicated, because adding the owner as an
 * explicit attendee is a natural thing for Matt to do and must not count twice.
 */
export function buildRoster(session: GroupSession): Roster {
  const seen = new Set<number>();
  const members: AttendeeRow[] = [];

  const push = (m: AttendeeRow) => {
    if (seen.has(m.clientId)) return;
    seen.add(m.clientId);
    members.push(m);
  };

  push({ clientId: session.ownerClientId, clientName: session.ownerClientName });
  for (const a of session.attendees) push(a);

  return { sessionId: session.sessionId, members, headCount: members.length };
}

/**
 * Whether a client can be added to a session's roster.
 *
 * Returns a reason rather than a bare boolean so the UI can say why the button is
 * disabled instead of silently doing nothing.
 */
export function canAddAttendee(
  session: GroupSession,
  clientId: number,
): { ok: true } | { ok: false; reason: string } {
  if (clientId === session.ownerClientId) {
    return { ok: false, reason: "This client owns the session and is already on the roster." };
  }
  if (session.attendees.some((a) => a.clientId === clientId)) {
    return { ok: false, reason: "Already on the roster." };
  }
  return { ok: true };
}

/**
 * Clients not yet on the roster, for the add picker.
 * Sorted by name so the list is stable and scannable.
 */
export function availableToAdd(
  session: GroupSession,
  allClients: AttendeeRow[],
): AttendeeRow[] {
  const roster = new Set(buildRoster(session).members.map((m) => m.clientId));
  return allClients
    .filter((c) => !roster.has(c.clientId))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/** "Reggie, Johnny and Pete" — for a compact summary line. */
export function formatRoster(members: AttendeeRow[]): string {
  const names = members.map((m) => m.clientName.split(" ")[0]);
  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}
