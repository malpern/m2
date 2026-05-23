import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Session {
  id: number;
  clientId: number;
  clientName: string;
  date: string;
  time: string;
  slot: string;
  status: string;
}

function getTimeUntil(time: string): string {
  const now = new Date();
  const [hours, mins] = time.split(":").map(Number);
  const sessionTime = new Date(now);
  sessionTime.setHours(hours, mins, 0, 0);

  const diff = sessionTime.getTime() - now.getTime();
  if (diff < 0) return "now";
  const diffMin = Math.floor(diff / 60000);
  if (diffMin < 60) return `in ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  return `in ${diffHr}h ${diffMin % 60}m`;
}

export function TodayCard({ todaySessions, tomorrowSessions }: { todaySessions: Session[]; tomorrowSessions: Session[] }) {
  const sorted = [...todaySessions].sort((a, b) => a.time.localeCompare(b.time));
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextSession = sorted.find((s) => s.time > currentTime && s.status !== "cancelled");

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Today</CardTitle>
          <Link href="/schedule" className="text-xs text-accent hover:underline">Full schedule &rarr;</Link>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 ? (
          <div className="space-y-1">
            {sorted.map((s) => {
              const isNext = nextSession?.id === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between py-2.5 text-sm border-b border-border last:border-0 ${
                    isNext ? "bg-accent/5 -mx-4 px-4 rounded-lg" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-12 font-mono text-xs">{s.slot}</span>
                    <Link href={`/clients/${s.clientId}`} className="font-medium hover:underline">{s.clientName}</Link>
                    {isNext && (
                      <span className="text-xs text-accent font-medium">{getTimeUntil(s.time)}</span>
                    )}
                  </div>
                  <Badge className={`border-0 ${
                    s.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400"
                    : s.status === "completed" ? "bg-blue-500/15 text-blue-400"
                    : s.status === "cancelled" ? "bg-red-500/15 text-red-400"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {s.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No sessions today.</p>
        )}

        {tomorrowSessions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">Tomorrow</div>
            {tomorrowSessions.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-1 text-sm text-muted-foreground">
                <span className="w-12 font-mono text-xs">{s.slot}</span>
                <span>{s.clientName}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
