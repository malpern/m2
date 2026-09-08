/**
 * How consent shows up in Matt's UI. Pure, so the wording is tested once and
 * the components stay thin.
 */
import type { ConsentEvent } from "@/db/schema";
import type { ConsentStatus } from "./sms-consent";
import { formatPhoneNumber } from "./utils";

export type ConsentChip = { label: string; tone: "ok" | "warn" | "bad" | "none" };

/** The chip for a client. `null` means show nothing — confirmed clients earn a quiet row. */
export function consentChip(status: ConsentStatus, hasPhone: boolean): ConsentChip | null {
  if (!hasPhone) return null; // the existing "no phone" chip already covers this
  switch (status) {
    case "confirmed": return null;
    case "pending": return { label: "pending", tone: "warn" };
    case "declined": return { label: "opted out", tone: "bad" };
    case "unknown": return { label: "not signed up", tone: "none" };
  }
}

export function consentStatusLabel(status: ConsentStatus): string {
  switch (status) {
    case "confirmed": return "Confirmed";
    case "pending": return "Pending";
    case "declined": return "Opted out";
    case "unknown": return "Not signed up";
  }
}

export const CHIP_CLASSES: Record<ConsentChip["tone"], string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-red-500/15 text-red-600 dark:text-red-400",
  none: "bg-muted text-muted-foreground border border-border",
};

/** One line per event, in Matt's words rather than the enum's. */
export function describeConsentEvent(e: ConsentEvent): string {
  switch (e.event) {
    case "signed_up": {
      const who = e.guardianName
        ? `${e.submittedName ?? "the athlete"}; parent/guardian ${e.guardianName} agreed`
        : (e.submittedName ?? "the client");
      return `Signed up at m2scheduler.com/text-signup as ${who}${e.consentTextVersion ? ` · consent text ${e.consentTextVersion}` : ""}`;
    }
    case "request_sent":
      return `Verification text sent${e.evidence ? ` · ${e.evidence}` : ""}`;
    case "confirmed":
      return e.method === "sms_keyword"
        ? `Texted an opt-in keyword unprompted${e.evidence ? ` · "${e.evidence}"` : ""}`
        : `Replied YES${e.evidence ? ` · "${e.evidence}"` : ""}`;
    case "declined":
      if (e.method === "manual") return `Matt marked them opted out${e.evidence ? ` · ${e.evidence}` : ""}`;
      return `Opted out by text${e.evidence ? ` · "${e.evidence}"` : ""}`;
    case "reset":
      return `Consent reset: ${e.evidence ?? "phone number changed"}`;
    case "linked":
      return `Signup for ${formatPhoneNumber(e.phone)} linked to this client`;
  }
}

/** The link Matt hands a client. */
export function signupLink(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://m2scheduler.com";
  return `${base.replace(/\/$/, "")}/text-signup`;
}
