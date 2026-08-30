import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ContactBlock } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — M2 Performance and Therapy",
  description: "Terms governing M2 Performance and Therapy's text messaging and session scheduling services.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="May 23, 2026">
      <p>
        These terms govern your use of text messaging services provided by M2 Performance and Therapy
        (&ldquo;M2,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) for session scheduling and communication.
      </p>

      <h2>Services</h2>
      <p>
        M2 provides athletic training and physical therapy services. We use text messaging to schedule
        sessions, send reminders, and communicate about your training.
      </p>

      <h2>Text Messaging</h2>
      <ul>
        <li>By providing your phone number, you agree to receive text messages from M2 related to scheduling and session management.</li>
        <li>Message frequency varies based on your training schedule.</li>
        <li>Message and data rates may apply depending on your carrier plan.</li>
        <li>Text STOP at any time to opt out of messages.</li>
        <li>Text HELP for assistance.</li>
      </ul>

      <h2>Session Policies</h2>
      <ul>
        <li>Sessions are scheduled based on availability and confirmed via text.</li>
        <li>Cancellations should be communicated as early as possible.</li>
        <li>Session packages are non-refundable and expire per the terms of your package agreement.</li>
      </ul>

      <h2>Privacy</h2>
      <p>
        Your personal information is handled in accordance with our{" "}
        <Link href="/privacy">Privacy Policy</Link>. We do not sell your information to third parties.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        M2 provides scheduling services on an &ldquo;as is&rdquo; basis. We are not liable for missed
        messages, scheduling errors caused by technical issues, or carrier delivery failures.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Continued use of our messaging services constitutes
        acceptance of updated terms.
      </p>

      <h2>Contact</h2>
      <ContactBlock />
    </LegalPage>
  );
}
