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
      </div>

      <div className="mb-8">
        <GoogleCalendarCard connected={googleStatus.connected} email={googleStatus.email} status={calendarStatus} />
      </div>

      <h2 className="text-lg font-bold mb-4">Outreach Timing</h2>
      <SettingsEditor />

      <Separator className="my-10" />

      <FeedbackSection initialItems={feedbackItems} />
    </div>
  );
}
