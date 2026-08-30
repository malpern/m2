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
