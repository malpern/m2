"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONSENT_LABEL, GUARDIAN_CONSENT_LABEL } from "@/lib/sms-consent";
import { submitTextSignup } from "./actions";
import type { SignupResponse } from "@/lib/signup";

/**
 * The form a client fills in themselves.
 *
 * Three rules a carrier reviewer will check, each visible in the markup:
 * the consent checkbox is never pre-checked; the words the client agrees to
 * are the checkbox's own label, not a link; and the privacy and terms links
 * sit beside it. The submit button stays disabled until the box is ticked so
 * the only way to submit is to have read and agreed.
 */
export function SignupForm() {
  const [state, action, pending] = useActionState<SignupResponse | null, FormData>(submitTextSignup, null);
  const [isMinor, setIsMinor] = useState(false);
  const [agreed, setAgreed] = useState(false);

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-[15px] leading-relaxed text-foreground" role="status">
        <p className="font-semibold mb-1">Almost done</p>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">{isMinor ? "Athlete\u2019s name" : "Your name"}</Label>
        <Input id="name" name="name" required maxLength={80} autoComplete="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{isMinor ? "Athlete\u2019s mobile number" : "Mobile number"}</Label>
        <Input id="phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="(650) 555-0142" />
      </div>

      <label className="flex items-start gap-3 text-[14px] leading-snug">
        <input
          type="checkbox"
          name="isMinor"
          checked={isMinor}
          onChange={(e) => setIsMinor(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span>The athlete is under 18. A parent or guardian is signing up and agreeing on their behalf.</span>
      </label>

      {isMinor && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-border/60 p-4">
          <div className="space-y-2">
            <Label htmlFor="guardianName">Parent or guardian&rsquo;s name</Label>
            <Input id="guardianName" name="guardianName" required maxLength={80} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardianPhone">Parent or guardian&rsquo;s mobile</Label>
            <Input id="guardianPhone" name="guardianPhone" type="tel" required inputMode="tel" autoComplete="off" placeholder="(650) 555-0100" />
          </div>
          <p className="sm:col-span-2 text-[13px] text-muted-foreground">
            Matt texts the athlete about their sessions. The parent gets a copy of the confirmation and can be
            reached at this number too. Both phones get a text asking to reply YES.
          </p>
        </div>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-[14px] leading-relaxed">
        <input
          type="checkbox"
          name="agreed"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-border"
          aria-describedby="consent-links"
        />
        <span>
          {isMinor ? GUARDIAN_CONSENT_LABEL : CONSENT_LABEL}{" "}
          <span id="consent-links" className="whitespace-nowrap">
            <Link href="/privacy" className="underline">Privacy Policy</Link>
            {" · "}
            <Link href="/terms" className="underline">Terms</Link>
          </span>
        </span>
      </label>

      {state && !state.ok && (
        <p className="text-[14px] text-red-400" role="alert">{state.error}</p>
      )}

      <Button type="submit" disabled={!agreed || pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Text me a confirmation"}
      </Button>

      <p className="text-[13px] text-muted-foreground">
        You&rsquo;ll get one text asking you to reply YES. Nothing else is sent until you do.
      </p>
    </form>
  );
}
