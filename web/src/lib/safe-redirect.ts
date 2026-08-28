// Normalize a user-supplied post-login redirect target to a safe, app-local
// path. Anything that could leave the origin (absolute URLs, protocol-relative
// "//host", backslash tricks, javascript:) falls back to a safe default.

export function normalizeRedirect(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  // Must be an absolute, same-origin path: a single leading "/".
  if (value[0] !== "/") return fallback;
  // Reject protocol-relative ("//host") and backslash-escaped ("/\\host") forms.
  if (value[1] === "/" || value[1] === "\\") return fallback;
  // Reject control characters (incl. newlines/tabs) that could smuggle a target.
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x20) return fallback;
  }
  return value;
}
