/**
 * Timestamps that actually compare against what SQLite stored.
 *
 * `created_at` columns default to `CURRENT_TIMESTAMP`, which SQLite writes as
 * `"2026-08-30 17:08:57"` — UTC, space-separated, with no timezone marker.
 * Two bugs followed from treating that as an ISO-8601 string, and both were
 * live in production:
 *
 *  1. **Comparisons silently matched nothing.** The queries filtered with
 *     `gte(createdAt, new Date(...).toISOString())`, i.e. against
 *     `"2026-08-30T17:00:00.000Z"`. These are TEXT columns, so the comparison
 *     is lexicographic, and `'T'` (0x54) sorts after `' '` (0x20) — so for any
 *     row on the same calendar date the stored value is always LESS than the
 *     threshold. `checkAndAlert` therefore counted zero recent errors on every
 *     invocation and has never sent an alert, and `getDailyDigest` reported
 *     zero of everything, every day.
 *
 *  2. **Parsing shifted the clock by the local UTC offset.** `Date.parse` reads
 *     a naive timestamp as LOCAL time, so a value written in UTC came back
 *     seven hours in the future on a PT machine — making a stale heartbeat look
 *     fresh, which is the precise direction a staleness check must not fail in.
 *
 * Both directions go through here now.
 */

/**
 * A UTC timestamp in SQLite's own `CURRENT_TIMESTAMP` format, safe to compare
 * lexicographically against a stored `created_at`.
 */
export function toSqlTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Parse a stored timestamp to epoch milliseconds, treating a naive value as
 * UTC — which is what SQLite wrote.
 *
 * Also accepts a genuine ISO-8601 string, since rows inserted by application
 * code rather than by the column default carry one, and a parser that only
 * handled one shape would just relocate the bug.
 *
 * Returns null rather than NaN so callers must decide what unknown means.
 */
export function parseSqlTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // Already carries a zone designator (Z, +01:00, -07:00) — trust it.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const normalized = hasZone ? s.replace(" ", "T") : `${s.replace(" ", "T")}Z`;

  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}
