import {
  SLOTS_IN_ORDER,
  SLOT_LENGTH_MINUTES,
  DEFAULT_SESSION_MINUTES,
  SLOT_TIMES,
  type TimeSlot,
} from "./constants";

/**
 * Variable session lengths (#2).
 *
 * Every slot is one hour wide, so a session longer than an hour occupies more
 * than one slot and must block all of them. Before this, `bookedKeys` in
 * suggest-alternatives keyed on a single start time, so a 90-minute session left
 * the hour it ran into looking free and could be double-booked.
 */

/** Lengths offered in the UI. Free-form minutes are still accepted by the data model. */
export const DURATION_CHOICES = [30, 45, 60, 90, 120] as const;

/**
 * Which slots a session occupies.
 *
 * A session shorter than an hour still consumes its whole slot — Matt cannot run
 * a 30-minute session at 3:00 and another at 3:30, because only the top of the
 * hour is bookable. So the count rounds UP, and never below one.
 *
 * Returns only slots that exist: a 120-minute session at 7pm spans one slot here,
 * because the day ends. It still runs late in reality; there is simply no later
 * slot for it to block.
 */
export function slotsSpanned(slot: TimeSlot, durationMinutes: number): TimeSlot[] {
  const start = SLOTS_IN_ORDER.indexOf(slot);
  if (start === -1) return [];
  const count = Math.max(1, Math.ceil((durationMinutes || DEFAULT_SESSION_MINUTES) / SLOT_LENGTH_MINUTES));
  return SLOTS_IN_ORDER.slice(start, start + count);
}

/**
 * The `date|time` keys a session blocks, matching how availability is keyed.
 * This is what makes a long session hide the hours it actually runs through.
 */
export function occupiedKeys(
  date: string,
  slot: TimeSlot,
  durationMinutes: number,
): string[] {
  return slotsSpanned(slot, durationMinutes).map((s) => `${date}|${SLOT_TIMES[s]}`);
}

/**
 * The length to use for a new session: the explicit value, else the client's
 * default, else the system default. Zero and negative values are treated as
 * unset rather than honoured — a zero-length session is never what was meant.
 */
export function resolveDuration(
  explicit: number | null | undefined,
  clientDefault: number | null | undefined,
): number {
  if (typeof explicit === "number" && explicit > 0) return explicit;
  if (typeof clientDefault === "number" && clientDefault > 0) return clientDefault;
  return DEFAULT_SESSION_MINUTES;
}

/** "1h", "30m", "1h 30m" — compact enough for a calendar chip. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** End time as HH:MM, for the calendar and for calendar-invite payloads. */
export function endTime(startHHMM: string, durationMinutes: number): string {
  const [h, m] = startHHMM.split(":").map(Number);
  const total = h * 60 + m + Math.max(0, durationMinutes);
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
