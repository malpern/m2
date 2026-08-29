/**
 * How to refer to a session in a client-facing message (#56).
 *
 * The issue asked three questions. The answers encoded here:
 *
 * 1. YES, mention the type. A client who turns up expecting one-to-one and finds
 *    a group has had a bad surprise that one word would have prevented.
 *
 * 2. NO, never name the other participants. Many clients are high-school athletes
 *    — the schema carries `parentGuardian` for a reason — and telling one client
 *    who else attends discloses a third party's participation and whereabouts. A
 *    COUNT carries the useful part ("this is not one-to-one") without identifying
 *    anyone. This is enforced by the signature rather than by convention: the
 *    function accepts a number, so there is no name here to leak.
 *
 * 3. NO separate confirmation flow. Only the wording changes. Forking the flow
 *    would split the whole inbound-SMS handler tree for a need the issue does not
 *    establish, and copy is cheap to change back where a forked flow is not.
 */

/** `sessions.session_type`, plus `clients.session_type`'s extra "dual". */
export type SessionKind = "individual" | "dual" | "group" | "late_cancel" | null;

/**
 * A noun phrase for the session, e.g. "a session", "your group session with 2 others".
 *
 * `otherAttendees` counts everyone on the roster EXCEPT the recipient. Pass 0 when
 * unknown — the phrase degrades to "your group session", which is still truthful.
 */
export function describeSession(kind: SessionKind, otherAttendees = 0): string {
  const others = Math.max(0, Math.floor(otherAttendees));

  switch (kind) {
    case "group": {
      if (others <= 0) return "your group session";
      return `your group session with ${others} ${others === 1 ? "other" : "others"}`;
    }
    case "dual":
      // Deliberately not "with <name>" — see the privacy note above.
      return "your partner session";
    default:
      // individual, late_cancel and null keep the original wording, so nothing
      // changes for the majority of clients.
      return "a session";
  }
}

/**
 * A trailing clause for messages already naming a time, e.g. a reminder.
 * Empty for individual sessions so those messages are untouched.
 */
export function sessionTypeSuffix(kind: SessionKind, otherAttendees = 0): string {
  if (kind !== "group" && kind !== "dual") return "";
  return ` for ${describeSession(kind, otherAttendees)}`;
}

/** A short tag for a line in a multi-session list, e.g. "• Monday at 3pm (group)". */
export function sessionTypeTag(kind: SessionKind): string {
  if (kind === "group") return " (group)";
  if (kind === "dual") return " (partner)";
  return "";
}
