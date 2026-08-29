import type { TimeSlot } from "@/lib/constants";

/** What `getOpenSlots` resolves to. */
export type OpenSlot = { day: string; date: string; slot: TimeSlot; time: string };

/** What `rankSlotsForClient` resolves to — the open slot plus its ranking score. */
export type RankedSlot = OpenSlot & { score: number };

/**
 * Build slot fixtures for the suggest-alternatives mocks.
 *
 * Two things go wrong when tests write these as bare array literals, and both did:
 * `slot: "3pm"` widens to `string` and stops satisfying `TimeSlot`, and the `score`
 * that `rankSlotsForClient` promises gets left off. Passing them through here fixes
 * the first (the parameter type pins the literal) and supplies the second.
 *
 * The result is assignable to `OpenSlot[]` as well, so a single fixture can feed
 * both `mockGetOpenSlots` and `mockRankSlotsForClient` — which is how these tests
 * already use them.
 *
 * Scores descend from the given order so "first is best" ranking stays intuitive.
 */
export function makeSlots(...items: OpenSlot[]): RankedSlot[] {
  return items.map((slot, i) => ({ ...slot, score: 100 - i }));
}
