import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DAY_NAMES_BY_INDEX } from "@/lib/constants";

interface SessionRow {
  id: number;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  slot: string;
}

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "pm" : "am";
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function LastWeekCard({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return null;

  const sorted = [...sessions]
    .filter((s) => s.status === "completed" || s.status === "confirmed")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  const today = new Date();
  const lastMonday = new Date(today);
  const dow = lastMonday.getDay();
  lastMonday.setDate(lastMonday.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  const lwStart = lastMonday.toISOString().split("T")[0];
  const lwEnd = lastSunday.toISOString().split("T")[0];

  const lastWeekSessions = sorted.filter(
    (s) => s.scheduledDate >= lwStart && s.scheduledDate <= lwEnd
  );

  const typicalDayTime = new Map<string, number>();
  for (const s of sorted) {
    const d = new Date(s.scheduledDate + "T12:00:00");
    const day = DAY_NAMES_BY_INDEX[d.getDay()];
    const time = timeLabel(s.scheduledTime);
    const k = `${day.slice(0, 3)} ${time}`;
    typicalDayTime.set(k, (typicalDayTime.get(k) ?? 0) + 1);
  }
  const totalSorted = sorted.length || 1;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Last Week</CardTitle>
      </CardHeader>
      <CardContent>
        {lastWeekSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions last week.</p>
        ) : (
          <div className="space-y-2">
            {lastWeekSessions.map((s) => {
              const d = new Date(s.scheduledDate + "T12:00:00");
              const dayName = DAY_NAMES_BY_INDEX[d.getDay()];
              const time = timeLabel(s.scheduledTime);
              const label = `${dayName.slice(0, 3)} ${time}`;
              const count = typicalDayTime.get(label) ?? 0;
              const pct = Math.round((count / totalSorted) * 100);
              const isUnusual = pct < 10;
              return (
                <div key={s.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium capitalize">{dayName.slice(0, 3)}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{time}</span>
                  </div>
                  {isUnusual ? (
                    <span className="text-[10px] font-medium bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
                      Unusual — only {pct}% of sessions
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {pct}% of sessions
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
