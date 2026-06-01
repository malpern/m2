/**
 * Shared constants used across scheduler, SMS handlers, and UI.
 *
 * If you add a new time-slot or day, update these maps so every consumer
 * stays in sync automatically.
 */

// ---------------------------------------------------------------------------
// Time-slot mapping  (slot label → 24-hour time string)
// ---------------------------------------------------------------------------

export type TimeSlot = "3pm" | "4pm" | "5pm" | "6pm" | "7pm";

export const SLOT_TIMES: Record<TimeSlot, string> = {
  "3pm": "15:00",
  "4pm": "16:00",
  "5pm": "17:00",
  "6pm": "18:00",
  "7pm": "19:00",
};

/**
 * Alias kept for callers that need a `Record<string, string>` (no TimeSlot key constraint).
 * Points to the same underlying object.
 */
export const SLOT_TIMES_MAP: Record<string, string> = SLOT_TIMES;

// ---------------------------------------------------------------------------
// Day helpers
// ---------------------------------------------------------------------------

export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "sunday";

/** JS Date.getDay() order (0 = Sunday … 6 = Saturday). */
export const DAY_NAMES_BY_INDEX = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

/** Lowercase day name → capitalised display label. */
export const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  sunday: "Sunday",
};

// ---------------------------------------------------------------------------
// Grade-level ranking (used by priority sort and UI sorting)
// ---------------------------------------------------------------------------

export const GRADE_RANK: Record<string, number> = {
  adult: 0,
  freshman: 1,
  sophomore: 2,
  junior: 3,
  senior: 4,
  post_grad: 5,
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Human-readable slot list, e.g. "Monday at 3pm, Wednesday at 5pm". */
export function formatSlotsText(slots: { day: string; slot: string }[]): string {
  return slots.map((s) => `${DAY_LABELS[s.day] ?? s.day} at ${s.slot}`).join(", ");
}
