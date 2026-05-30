import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SettingsEditor } from "./settings-editor";
import { FeedbackSection } from "./feedback";
import { getFeedbackItems } from "./feedback-actions";
import { GoogleCalendarCard } from "./google-calendar-card";
import { isConnected } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; error?: string }>;
}) {
  const params = await searchParams;
  const calendarStatus = params.calendar === "connected" ? "connected" : params.error ? "error" : undefined;
  const googleStatus = await isConnected();

  let feedbackItems: Awaited<ReturnType<typeof getFeedbackItems>> = [];
  try {
    feedbackItems = await getFeedbackItems();
  } catch {
    // GitHub token might not be set
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Link href="/schedule/priority">
          <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
            <CardContent className="pt-5 pb-4">
              <div className="font-semibold text-sm">Priority Ranking</div>
              <div className="text-xs text-muted-foreground mt-0.5">Adjust how college, grade, and effort affect ranking</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/schedule/availability">
          <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
            <CardContent className="pt-5 pb-4">
              <div className="font-semibold text-sm">Availability</div>
              <div className="text-xs text-muted-foreground mt-0.5">Set your default hours and weekly overrides</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/settings/logs">
          <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
            <CardContent className="pt-5 pb-4">
              <div className="font-semibold text-sm">System Logs</div>
              <div className="text-xs text-muted-foreground mt-0.5">View activity feed and technical logs</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mb-4">
        <GoogleCalendarCard connected={googleStatus.connected} email={googleStatus.email} status={calendarStatus} />
      </div>

      {googleStatus.connected && (
        <div className="mb-8">
          <Link href="/settings/import-clients">
            <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
              <CardContent className="pt-5 pb-4">
                <div className="font-semibold text-sm">Import Real Clients</div>
                <div className="text-xs text-muted-foreground mt-0.5">Pull client names from Google Sheets &amp; Calendar to replace test data</div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      <h2 className="text-lg font-bold mb-4">API Billing</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">
          <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Anthropic API</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Manage credits for AI reply classification</div>
                </div>
                <svg className="w-4 h-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer">
          <Card className="hover:border-foreground/20 transition-colors cursor-pointer h-full">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Twilio</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Manage credits for WhatsApp messaging</div>
                </div>
                <svg className="w-4 h-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      <h2 className="text-lg font-bold mb-4">Outreach Timing</h2>
      <SettingsEditor />

      <Separator className="my-10" />

      <FeedbackSection initialItems={feedbackItems} />

      <Separator className="my-10" />

      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-sm text-muted-foreground hover:text-destructive transition-colors"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
