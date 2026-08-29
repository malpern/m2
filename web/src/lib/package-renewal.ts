/**
 * Package renewal prompts (#4).
 *
 * When a client is nearly out of sessions, Matt should be nudged to ask them to
 * re-up — but the message is his to review and edit before anything is sent, the
 * same as the scheduling outreach flow.
 */

/**
 * A package at or below this many remaining sessions is "running low".
 *
 * From the issue. Named rather than inlined because it is a judgement call about
 * how much warning Matt wants, not a fact about the domain.
 */
export const RENEWAL_THRESHOLD = 2;

export type PackageBalance = { remaining: number; total: number; used: number };

/**
 * Whether to prompt for a renewal.
 *
 * A package with nothing left still counts — that is the most urgent case, not a
 * finished one to hide. Negative balances (an over-drawn package, which
 * manualAdjustment permits) count too.
 */
export function needsRenewal(balance: PackageBalance | null): boolean {
  if (!balance) return false;
  return balance.remaining <= RENEWAL_THRESHOLD;
}

/**
 * The draft Matt edits. Wording follows the issue; the pluralisation and the
 * zero case are the parts worth getting right, since "you've got 0 sessions
 * left" and "1 sessions left" both read as a bug to the client.
 */
export function buildRenewalMessage(clientName: string, remaining: number): string {
  const firstName = clientName.trim().split(/\s+/)[0] || clientName;

  if (remaining <= 0) {
    return `Hey ${firstName}, you're out of sessions on your package. Want to re-up?`;
  }
  const sessions = remaining === 1 ? "1 session" : `${remaining} sessions`;
  return `Hey ${firstName}, you've got ${sessions} left on your package. Want to re-up?`;
}
