import type { Metadata } from "next";
import { LegalPage, ContactBlock } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — M2 Performance and Therapy",
  description: "How M2 Performance and Therapy collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="May 23, 2026">
      <p>
        M2 Performance and Therapy (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates a
        scheduling and communication platform for athletic training services. This policy describes how we
        collect, use, and protect your personal information.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li><strong>Contact information:</strong> Name, phone number, and email address provided when you sign up for training sessions.</li>
        <li><strong>Scheduling data:</strong> Session dates, times, preferences, and attendance history.</li>
        <li><strong>Messages:</strong> Text messages exchanged for scheduling purposes.</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To schedule and confirm training sessions</li>
        <li>To send appointment reminders and scheduling updates via text message</li>
        <li>To track session packages and billing</li>
        <li>To improve our services</li>
      </ul>

      <h2>Text Messaging</h2>
      <p>
        By providing your phone number, you consent to receive text messages related to session scheduling,
        reminders, and updates. Message frequency varies. Message and data rates may apply.
      </p>
      <p>
        You can opt out of text messages at any time by replying STOP. After opting out, you will no longer
        receive scheduling texts. Reply HELP at any time for assistance, or contact us at the number below.
        You may opt back in by contacting us directly.
      </p>
      <p>
        <strong>
          No mobile information will be shared with third parties or affiliates for marketing or promotional
          purposes.
        </strong>{" "}
        Information sharing to subcontractors in support services, such as our messaging provider, is
        permitted. All other use case categories exclude text messaging originator opt-in data and consent;
        this information will not be shared with any third parties.
      </p>

      <h2>Information Sharing</h2>
      <p>
        We do not sell, trade, or rent your personal information to third parties. We may share information
        with service providers (such as our messaging platform) solely to deliver our services.
      </p>
      <p>
        Phone numbers and text-message consent are never shared with third parties or affiliates for
        marketing or promotional purposes, and are not sold under any circumstances.
      </p>

      <h2>Data Security</h2>
      <p>
        We use reasonable measures to protect your personal information. However, no method of electronic
        transmission or storage is 100% secure.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain your information for as long as you are an active client and for a reasonable period
        afterward for record-keeping purposes.
      </p>

      <h2>Contact Us</h2>
      <p>If you have questions about this privacy policy, contact us at:</p>
      <ContactBlock />
    </LegalPage>
  );
}
