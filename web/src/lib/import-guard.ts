// Guard for the destructive client-import flow. The import deletes ALL clients,
// sessions, packages, and outreach before inserting the selected set, so it must
// not run unless the operator explicitly confirmed (or there is nothing to lose).

export type DeletionCounts = {
  clients: number;
  sessions: number;
  packages: number;
  outreach: number;
};

export function hasExistingData(counts: DeletionCounts): boolean {
  return (
    counts.clients > 0 ||
    counts.sessions > 0 ||
    counts.packages > 0 ||
    counts.outreach > 0
  );
}

// Destructive replacement is allowed only when the operator explicitly
// confirmed, or when there is no existing data that would be erased.
export function canReplace(
  confirmReplace: boolean | undefined,
  counts: DeletionCounts,
): boolean {
  return confirmReplace === true || !hasExistingData(counts);
}
