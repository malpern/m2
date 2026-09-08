/**
 * The public text-signup form, minus the HTTP.
 *
 * Everything the form handler decides lives here so it can be tested without
 * a Next.js runtime: what counts as a valid submission, how the IP and user
 * agent are folded into evidence without storing either, the rate limits, and
 * — most importantly — the rule that the visitor's answer is the SAME whether
 * the number was known, unknown, already pending, or refused. A public form on
 * an app that otherwise sits behind a password must not become a way to test
 * which numbers are clients.
 */
import { createHash } from "crypto";
import { toE164 } from "./phone";
import { isRateLimited } from "./rate-limit";
import { recordSignup, sendVerification } from "./consent";
import { formatPhoneNumber } from "./utils";

/** Submissions per IP per hour before the form stops sending. */
export const SIGNUP_IP_MAX = 5;
export const SIGNUP_IP_WINDOW_MS = 60 * 60_000;

export type SignupFields = {
  name: string;
  phone: string;
  isMinor: boolean;
  guardianName: string;
  agreed: boolean;
};

export type SignupValidation =
  | { ok: true; name: string; e164: string; guardianName: string | null }
  | { ok: false; error: string };

export function readSignupFields(form: FormData): SignupFields {
  const str = (k: string) => (form.get(k) as string | null)?.toString().trim() ?? "";
  return {
    name: str("name"),
    phone: str("phone"),
    isMinor: form.get("isMinor") === "on",
    guardianName: str("guardianName"),
    agreed: form.get("agreed") === "on",
  };
}

export function validateSignup(f: SignupFields): SignupValidation {
  if (!f.agreed) return { ok: false, error: "Please tick the box to agree to receive texts." };
  if (f.name.length < 2) return { ok: false, error: "Please enter your name." };
  if (f.name.length > 80) return { ok: false, error: "That name is too long." };
  const phone = toE164(f.phone);
  if (!phone.ok) return { ok: false, error: "Please enter a valid US mobile number." };
  if (f.isMinor && f.guardianName.length < 2) {
    return { ok: false, error: "Please enter your parent or guardian's name." };
  }
  if (f.guardianName.length > 80) return { ok: false, error: "That name is too long." };
  return { ok: true, name: f.name, e164: phone.e164, guardianName: f.isMinor ? f.guardianName : null };
}

/**
 * Where the submission came from, without keeping the IP itself. A salted
 * hash is enough to show two signups were the same visitor, which is all a
 * reviewer or an abuse investigation needs.
 */
export function submissionEvidence(ip: string, userAgent: string): string {
  const salt = process.env.APP_PASSWORD ?? "m2";
  const h = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
  return `web form · ip:${h} · ua:${userAgent.slice(0, 120)}`;
}

export type SignupResponse = { ok: true; message: string } | { ok: false; error: string };

/** The one success message. Identical for every outcome that is not a validation error. */
export function successMessage(e164: string): string {
  return `Check your phone. We just texted ${formatPhoneNumber(e164)}. Reply YES and you're set. If nothing arrives in a few minutes, check the number and try again tomorrow, or ask Matt.`;
}

/**
 * Handle one submission end to end.
 *
 * Validation errors are returned to the visitor because they are about the
 * visitor's own input. Everything after that — rate limited, number opted out,
 * already texted today, outreach switched off, unknown number — produces the
 * same success message, because each of those answers would otherwise reveal
 * something about who is in the database.
 */
export async function processSignup(input: {
  form: FormData;
  ip: string;
  userAgent: string;
}): Promise<SignupResponse> {
  const v = validateSignup(readSignupFields(input.form));
  if (!v.ok) return { ok: false, error: v.error };

  if (isRateLimited(`signup:${input.ip}`, SIGNUP_IP_MAX, SIGNUP_IP_WINDOW_MS)) {
    return { ok: true, message: successMessage(v.e164) };
  }

  const signup = await recordSignup({
    phone: v.e164,
    name: v.name,
    guardianName: v.guardianName,
    evidence: submissionEvidence(input.ip, input.userAgent),
  });
  if (signup.outcome === "recorded") {
    // sendVerification enforces the per-number 24h limit and the consent gate.
    await sendVerification(v.e164);
  }
  return { ok: true, message: successMessage(v.e164) };
}
