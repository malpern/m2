import type { Metadata } from "next";
import { LegalPage, ContactBlock } from "@/components/legal-page";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Session texts — M2 Performance and Therapy",
  description: "Sign up to receive session scheduling text messages from M2 Performance and Therapy.",
  robots: { index: true, follow: true },
};

/**
 * The public opt-in page for text messaging.
 *
 * This URL is what the A2P 10DLC campaign registration points reviewers at,
 * so it must load without a sign-in and must show the consent language next
 * to an unchecked box. It is listed in proxy.ts's PUBLIC_EXACT and renders
 * without the app chrome. Nothing here reads the database; the form's server
 * action does that, behind rate limits, and never reveals whether a number is
 * already a client.
 */
export default function TextSignupPage() {
  return (
    <LegalPage title="Get your M2 session texts" updated="September 8, 2026">
      <p>
        Matt uses text messages to schedule your training: offers for open times, confirmations,
        and reminders. Sign up here, then reply <strong>YES</strong> to the text we send you.
      </p>

      <SignupForm />

      <h2>Good to know</h2>
      <ul>
        <li>Texting is optional. Saying no changes nothing about your training.</li>
        <li>Reply <strong>STOP</strong> to any message to opt out, or <strong>HELP</strong> for help.</li>
        <li>Your number is used only for scheduling and is never shared for marketing.</li>
      </ul>

      <ContactBlock />
    </LegalPage>
  );
}
