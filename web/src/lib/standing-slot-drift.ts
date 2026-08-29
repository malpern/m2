import { parseStandingSlot } from "./scheduler";
import { DAY_NAMES_BY_INDEX, DAY_LABELS, type DayOfWeek, type TimeSlot } from "./constants";

/**
 * Detect when a client's real booking pattern has drifted away from the standing
 * slot recorded on their profile (#25).
 *
 * Standing slots are typed in by hand and never revisited, so a client who
 * gradually moves from Mon/Thu to Tue/Fri keeps getting offered the old days.
 *
 * This only ever *reports*. Nothing here writes — per the issue, Matt reviews the
 * suggestion and applies it himself, because a run of holiday reschedules looks
 * exactly like a permanent move and only he can tell them apart.
 */

export type SlotEntry = { day: DayOfWeek; slot: TimeSlot };

export type DriftAnalysis =
  | { drifted: false; reason: string }
  | {
      drifted: true;
      /** What the profile currently claims. */
      current: SlotEntry[];
      /** What they have actually been booking, consistently. */
      observed: SlotEntry[];
      weeksAnalysed: number;
      /** Ready-to-display summary, e.g. "now booking Tue 5pm, Fri 3pm instead of Mon 3pm, Thu 3pm". */
      summary: string;
    };

export type SessionForDrift = {
  scheduledDate: string;
  slot: string;
  status: string;
};

/**
 * Tunables. These are judgement calls, not derived from anything, so they live
 * here named rather than buried as literals in the logic.
 */
export const DRIFT_DEFAULTS = {
  /** How far back to look. The issue suggests 4-6 weeks; 6 gives a steadier signal. */
  weeks: 6,
  /**
   * Weeks with at least one attended session. Below this there is not enough
   * signal to distinguish a move from a gap, and flagging would be noise.
   */
  minWeeksWithData: 4,
  /**
   * A day+slot must appear in at least this share of the weeks that had data
   * before it counts as part of the pattern. 0.6 means "most weeks" — high
   * enough to ignore one-off reschedules, low enough to catch a real move that
   * skipped a week.
   */
  consistencyThreshold: 0.6,
} as const;

/** Monday-based week key, so a week is a stable bucket regardless of timezone drift. */
function weekKeyOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function dayOf(dateStr: string): DayOfWeek | null {
  const d = new Date(dateStr + "T12:00:00Z");
  const name = DAY_NAMES_BY_INDEX[d.getUTCDay()];
  // Saturday is a real calendar day but not a bookable DayOfWeek in this app.
  return name === "saturday" ? null : (name as DayOfWeek);
}

const keyOf = (e: SlotEntry) => `${e.day} ${e.slot}`;

function formatEntries(entries: SlotEntry[]): string {
  return entries
    .map((e) => `${DAY_LABELS[e.day]?.slice(0, 3) ?? e.day} ${e.slot}`)
    .join(", ");
}

/**
 * Sessions that count as evidence of where a client actually shows up.
 *
 * `proposed` is excluded deliberately: it is the system's own guess, generated
 * *from* the standing slot. Counting it would make the standing slot confirm
 * itself and this check could never fire.
 */
function isAttendance(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

export function analyseStandingSlotDrift(
  standingSlot: string | null,
  sessions: SessionForDrift[],
  today: Date,
  opts: Partial<typeof DRIFT_DEFAULTS> = {},
): DriftAnalysis {
  const { weeks, minWeeksWithData, consistencyThreshold } = { ...DRIFT_DEFAULTS, ...opts };

  if (!standingSlot?.trim()) {
    return { drifted: false, reason: "No standing slot set for this client." };
  }
  const current = parseStandingSlot(standingSlot);
  if (current.length === 0) {
    return { drifted: false, reason: `Standing slot "${standingSlot}" could not be parsed.` };
  }

  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const recent = sessions.filter(
    (s) => isAttendance(s.status) && s.scheduledDate >= cutoffStr && s.scheduledDate <= todayStr,
  );

  const weeksWithData = new Set(recent.map((s) => weekKeyOf(s.scheduledDate)));
  if (weeksWithData.size < minWeeksWithData) {
    return {
      drifted: false,
      reason: `Only ${weeksWithData.size} of the last ${weeks} weeks have attended sessions — not enough to judge a pattern.`,
    };
  }

  // Count the distinct weeks each day+slot appears in, not raw occurrences, so
  // three sessions in one unusual week cannot outvote a steady weekly habit.
  const weeksByEntry = new Map<string, Set<string>>();
  for (const s of recent) {
    const day = dayOf(s.scheduledDate);
    if (!day) continue;
    const k = `${day} ${s.slot}`;
    if (!weeksByEntry.has(k)) weeksByEntry.set(k, new Set());
    weeksByEntry.get(k)!.add(weekKeyOf(s.scheduledDate));
  }

  const required = weeksWithData.size * consistencyThreshold;
  const observed: SlotEntry[] = [...weeksByEntry.entries()]
    .filter(([, ws]) => ws.size >= required)
    .map(([k]) => {
      const [day, slot] = k.split(" ");
      return { day: day as DayOfWeek, slot: slot as TimeSlot };
    })
    .sort((a, b) => DAY_NAMES_BY_INDEX.indexOf(a.day) - DAY_NAMES_BY_INDEX.indexOf(b.day));

  if (observed.length === 0) {
    return {
      drifted: false,
      reason: "No consistent booking pattern in the recent sessions.",
    };
  }

  const currentKeys = new Set(current.map(keyOf));
  const observedKeys = new Set(observed.map(keyOf));
  const same =
    currentKeys.size === observedKeys.size && [...currentKeys].every((k) => observedKeys.has(k));

  if (same) {
    return { drifted: false, reason: "Booking pattern matches the standing slot." };
  }

  return {
    drifted: true,
    current,
    observed,
    weeksAnalysed: weeksWithData.size,
    summary: `now booking ${formatEntries(observed)} instead of ${formatEntries(current)}`,
  };
}

/** The value to write into `clients.standingSlot` when accepting a suggestion. */
export function formatStandingSlot(entries: SlotEntry[]): string {
  return entries.map((e) => `${DAY_LABELS[e.day]?.slice(0, 3) ?? e.day} ${e.slot}`).join(", ");
}
