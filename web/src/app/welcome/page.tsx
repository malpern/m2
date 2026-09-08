import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, ContactBlock } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "M2 Scheduler — M2 Performance and Therapy",
  description:
    "M2 Scheduler is the private session-scheduling tool used by M2 Performance and Therapy to book training sessions, keep them on the practice's Google Calendar, and confirm them with clients by text.",
};

/**
 * The public front door.
 *
 * Google's OAuth branding review requires the app's home page to be reachable
 * without signing in and to say what the app is for. The dashboard at "/" is
 * neither — it is behind the app password, and the review bounced on exactly
 * those two points. proxy.ts rewrites an unauthenticated visit to "/" here;
 * a signed-in visit still lands on the dashboard, so nothing changes for Matt.
 */
export default function WelcomePage() {
  return (
    <LegalPage title="M2 Scheduler" updated="September 7, 2026">
      <p>
        M2 Scheduler is the private scheduling tool used by <strong>M2 Performance and Therapy LLC</strong>,
        a personal-training and physical-therapy practice in Los Altos, California. It is operated by the
        practice for its own clients and is not a public service.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Plans each week&rsquo;s training sessions from the practice&rsquo;s availability and client preferences.</li>
        <li>Keeps confirmed sessions on the practice&rsquo;s Google Calendar, and removes them when a session is cancelled.</li>
        <li>Reads the practice&rsquo;s client roster from its Google Sheet to keep client records current.</li>
        <li>Confirms and reschedules sessions with clients by text message, only after a client has opted in.</li>
      </ul>

      <h2>How it uses Google</h2>
      <p>
        The practice owner connects one Google account. M2 Scheduler requests only the access it uses:
        <strong> calendar events</strong> (to create, update and cancel session events on the practice calendar),
        <strong> read-only access to Google Sheets</strong> (to read the client roster), and the account&rsquo;s
        <strong> email address</strong> (to show which account is connected). It never requests access to
        Gmail, Drive, or other calendars&rsquo; settings, and it never writes to the spreadsheet.
      </p>

      <h2>Policies</h2>
      <p>
        <Link href="/privacy" className="underline">Privacy Policy</Link>
        {" · "}
        <Link href="/terms" className="underline">Terms of Service</Link>
      </p>

      <h2>Staff sign-in</h2>
      <p>
        Scheduling, client records and messaging are available only to the practice.{" "}
        <Link href="/login" className="underline">Sign in</Link>
      </p>

      <ContactBlock />
    </LegalPage>
  );
}
