/**
 * Revenue calculation utilities.
 *
 * Rates are stored in cents (integer) in the database.
 * We compute totals in cents, then format as dollars for display.
 */

export interface CompletedSessionWithRate {
  sessionId: number;
  clientId: number;
  /** Client-level rate in cents (nullable) */
  clientSessionRate: number | null;
  /** Package-level rate in cents (nullable) */
  packagePricePerSession: number | null;
  /** ISO date string, e.g. "2026-05-15" */
  scheduledDate: string;
}

export interface RevenueStats {
  /** Total estimated revenue in cents for sessions with rates */
  totalRevenueCents: number;
  /** Number of completed sessions that had a rate (client or package) */
  sessionsWithRate: number;
  /** Total completed sessions examined */
  totalCompletedSessions: number;
  /** Average revenue per week in cents (over distinct ISO weeks with rated sessions) */
  weeklyAvgRevenueCents: number;
  /** Display-ready dollar string, e.g. "$1,234.00" */
  totalRevenueDisplay: string;
  /** Display-ready dollar string for weekly average */
  weeklyAvgRevenueDisplay: string;
}

/**
 * Resolve the effective rate for a session.
 * Priority: client sessionRate > package pricePerSession > null (skip).
 */
export function resolveSessionRate(
  clientSessionRate: number | null,
  packagePricePerSession: number | null,
): number | null {
  if (clientSessionRate != null && clientSessionRate > 0) return clientSessionRate;
  if (packagePricePerSession != null && packagePricePerSession > 0) return packagePricePerSession;
  return null;
}

/**
 * Get the Monday (ISO week start) for a given date string.
 */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return mon.toISOString().split("T")[0];
}

/**
 * Format cents as a US dollar string.
 */
export function formatCentsAsDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Calculate revenue stats from a list of completed sessions with rate info.
 */
export function calculateRevenue(sessions: CompletedSessionWithRate[]): RevenueStats {
  let totalRevenueCents = 0;
  let sessionsWithRate = 0;
  const weekRevenue = new Map<string, number>();

  for (const s of sessions) {
    const rate = resolveSessionRate(s.clientSessionRate, s.packagePricePerSession);
    if (rate == null) continue;

    sessionsWithRate++;
    totalRevenueCents += rate;

    const weekKey = getWeekStart(s.scheduledDate);
    weekRevenue.set(weekKey, (weekRevenue.get(weekKey) ?? 0) + rate);
  }

  const weekCount = weekRevenue.size;
  const weeklyAvgRevenueCents = weekCount > 0 ? Math.round(totalRevenueCents / weekCount) : 0;

  return {
    totalRevenueCents,
    sessionsWithRate,
    totalCompletedSessions: sessions.length,
    weeklyAvgRevenueCents,
    totalRevenueDisplay: formatCentsAsDollars(totalRevenueCents),
    weeklyAvgRevenueDisplay: formatCentsAsDollars(weeklyAvgRevenueCents),
  };
}
