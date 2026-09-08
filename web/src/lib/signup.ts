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
import { createHmac } from "crypto";
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
  guardianPhone: string;
  agreed: boolean;
};

export type SignupValidation =
  | { ok: true; name: string; e164: string; guardianName: string | null; guardianPhone: string | null }
  | { ok: false; error: string };

export function readSignupFields(form: FormData): SignupFields {
  const str = (k: string) => (form.get(k) as string | null)?.toString().trim() ?? "";
  return {
    name: str("name"),
    phone: str("phone"),
    isMinor: form.get("isMinor") === "on",
    guardianName: str("guardianName"),
    guardianPhone: str("guardianPhone"),
    agreed: form.get("agreed") === "on",
  };
}

export function validateSignup(f: SignupFields): SignupValidation {
  if (!f.agreed) return { ok: false, error: "Please tick the box to agree to receive texts." };
  if (f.name.length < 2) return { ok: false, error: "Please enter your name." };
  if (f.name.length > 80) return { ok: false, error: "That name is too long." };
  const phone = toE164(f.phone);
  if (!phone.ok) return { ok: false, error: "Please enter a valid US mobile number." };
  if (f.guardianName.length > 80) return { ok: false, error: "That name is too long." };
  if (!f.isMinor) return { ok: true, name: f.name, e164: phone.e164, guardianName: null, guardianPhone: null };

  if (f.guardianName.length < 2) return { ok: false, error: "Please enter the parent or guardian's name." };
  const gPhone = toE164(f.guardianPhone);
  if (!gPhone.ok) return { ok: false, error: "Please enter the parent or guardian's mobile number." };
  if (gPhone.e164 === phone.e164) {
    return { ok: false, error: "The parent or guardian's number must be different from the athlete's." };
  }
  return { ok: true, name: f.name, e164: phone.e164, guardianName: f.guardianName, guardianPhone: gPhone.e164 };
}

/**
 * Where the submission came from, without keeping the IP itself. A salted
 * hash is enough to show two signups were the same visitor, which is all a
 * reviewer or an abuse investigation needs.
 */
export function submissionEvidence(ip: string, userAgent: string): string {
  // Keyed so the hash cannot be reversed by hashing the IPv4 space. The key
  // is its own setting, not the app password: this is a pseudonymiser, and a
  // password must never be an input to anything but the login check.
  const key = process.env.SIGNUP_EVIDENCE_KEY ?? "m2-signup-evidence";
  const h = createHmac("sha256", key).update(ip).digest("hex").slice(0, 16);
  return `web form · ip:${h} · ua:${userAgent.slice(0, 120)}`;
}

export type SignupResponse = { ok: true; message: string } | { ok: false; error: string };

/** The one success message. Identical for every outcome that is not a validation error. */
export function successMessage(e164: string, guardianE164?: string | null): string {
  const where = guardianE164
    ? `${formatPhoneNumber(e164)} and ${formatPhoneNumber(guardianE164)}. Reply YES from each phone`
    : `${formatPhoneNumber(e164)}. Reply YES`;
  return `Check your phone. We just texted ${where} and you're set. If nothing arrives in a few minutes, check the number and try again tomorrow, or ask Matt.`;
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

  const message = successMessage(v.e164, v.guardianPhone);
  if (isRateLimited(`signup:${input.ip}`, SIGNUP_IP_MAX, SIGNUP_IP_WINDOW_MS)) {
    return { ok: true, message };
  }

  const signup = await recordSignup({
    phone: v.e164,
    name: v.name,
    guardianName: v.guardianName,
    guardianPhone: v.guardianPhone,
    evidence: submissionEvidence(input.ip, input.userAgent),
  });
  if (signup.outcome === "recorded") {
    // sendVerification enforces the per-number 24h limit and the consent gate,
    // for each number separately: the parent's YES and the athlete's YES are
    // two different consents.
    await sendVerification(v.e164);
    if (v.guardianPhone) await sendVerification(v.guardianPhone);
  }
  return { ok: true, message };
}
