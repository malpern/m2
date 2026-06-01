import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionList } from "@/components/session-list";

interface SessionData {
  id: number;
  clientId: number;
  clientName: string;
  date: string;
  time: string;
  slot: string;
  status: string;
}

export function DashboardSessionCard({
  sessionListData,
  tomorrowSessions,
}: {
  sessionListData: { sessions: SessionData[]; label: string; showTomorrow: boolean } | null;
  tomorrowSessions: SessionData[];
}) {
  if (!sessionListData) {
    return (
      <Card className="mb-4">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">No sessions scheduled</p>
          <Link href="/schedule" className="text-sm text-accent hover:underline">Go to Schedule &rarr;</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{sessionListData.label}</CardTitle>
          <Link href="/schedule" className="text-xs text-accent hover:underline">Full schedule &rarr;</Link>
        </div>
      </CardHeader>
      <CardContent>
        <SessionList sessions={sessionListData.sessions} />
        {sessionListData.showTomorrow && tomorrowSessions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">Tomorrow</div>
            {tomorrowSessions.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
                <span className="w-10 font-mono text-xs">{s.slot}</span>
                <Link href={`/clients/${s.clientId}`} className="hover:underline">{s.clientName}</Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
