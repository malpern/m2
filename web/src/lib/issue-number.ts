/**
 * Validate a GitHub issue number arriving from the client.
 *
 * Server actions are a network boundary. Their arguments are deserialized from
 * a request, and TypeScript's types are erased at runtime, so a parameter
 * declared `number` can be a string — or anything else — when it actually
 * arrives. `deleteFeedback` interpolates this value into a GitHub API path on
 * a request carrying a privileged GITHUB_TOKEN, so an unvalidated value is
 * path injection against an authenticated endpoint.
 */
export function isValidIssueNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Find a requested issue among the ones we actually know about.
 *
 * Two things at once, and the second is the more important:
 *
 *  - **Authorization.** Validating that the input *looks* like an issue number
 *    says nothing about whether it is one of OURS. `deleteFeedback(42)` would
 *    close issue #42 in the repository whether or not it was ever feedback,
 *    relabelling a real bug report as `feedback,deleted`. Resolving against
 *    the known feedback issues makes that unrepresentable.
 *  - **Taint.** The returned item comes from the GitHub API response, not from
 *    the request, so the value that ends up in the outgoing URL no longer
 *    derives from user input. Validation alone did not satisfy CodeQL's
 *    dataflow analysis, and on reflection it should not have: a guard that
 *    proves a value is a positive integer does not prove it is safe to use.
 */
export function findIssue<T extends { number: number }>(
  items: readonly T[],
  requested: unknown,
): T | undefined {
  if (!isValidIssueNumber(requested)) return undefined;
  return items.find((item) => item.number === requested);
}
