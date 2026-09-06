/**
 * Phone normalization to E.164, for data arriving from outside the app.
 *
 * The schema stores E.164 (`+14082099509`) and puts a UNIQUE index on it, but
 * humans typing into a spreadsheet produce "(408) 209-9509", "408.209.9509",
 * "408-209-9509 (mom)". Storing those verbatim would defeat the unique index —
 * the same number in two formats is two rows — and would not match the inbound
 * lookup in `sms-handlers/shared`, which compares on the last 10 digits.
 *
 * This is deliberately US/NANP-only. Every client is local to a gym in Los
 * Altos, and a permissive parser that "handles international" would mostly
 * serve to accept typos as valid foreign numbers.
 */

export type PhoneParse =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

/**
 * NANP validity, which is what rejects the placeholder rather than a special
 * case for it. Area code and exchange are both NXX with N in 2-9, so
 * `+15550000000` (exchange `000`) fails the general rule — as do `0`/`1`-led
 * area codes and the all-zeros and all-ones strings that spreadsheets collect.
 * Encoding the actual rule beats a blocklist that only knows the placeholders
 * we have already seen.
 */
function isValidNanp(ten: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten);
}

/**
 * Parse a human-entered US number into E.164.
 *
 * Returns a reason rather than null so a preview can tell the operator WHY a
 * row was skipped — "not a usable number" and "we had no value" are different
 * problems with different fixes, and collapsing them into a null hides which
 * one you have.
 */
export function toE164(raw: string | null | undefined): PhoneParse {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };

  // Extensions and parenthetical notes ("x203", "(mom)") are common in this
  // sheet and carry digits that would otherwise be absorbed into the number —
  // "408-209-9509 x12" must not parse as 12 digits. Both are stripped before
  // digit extraction.
  //
  // Note the parenthetical rule keys on the group CONTAINING A LETTER. A blanket
  // "drop anything in parens" would eat the area code in the single most common
  // format in this sheet, "(408) 209-9509", and report it as having no digits.
  const trimmed = raw
    .replace(/\s*(?:x|ext|extension)\.?\s*\d+\s*$/i, "")
    .replace(/\([^)]*[a-z][^)]*\)/gi, "");
  const digits = trimmed.replace(/\D/g, "");

  let ten: string;
  if (digits.length === 10) ten = digits;
  else if (digits.length === 11 && digits.startsWith("1")) ten = digits.slice(1);
  else if (digits.length === 0) return { ok: false, reason: "no digits" };
  else return { ok: false, reason: `${digits.length} digits, expected 10` };

  if (!isValidNanp(ten)) return { ok: false, reason: "not a valid US number" };

  return { ok: true, e164: `+1${ten}` };
}

/** Normalize an email for comparison and storage. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  // Deliberately loose: this is a "does it look like an address" check, not
  // RFC 5322. A wrong-but-plausible address is a data problem the operator
  // must see in the preview, not something a regex should silently drop.
  return e.includes("@") && !e.includes(" ") ? e : null;
}
