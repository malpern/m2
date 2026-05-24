type SessionEntry = { time: string; status: string };

function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "pm" : "am";
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthGrid({
  year,
  month,
  sessionDates,
  gaps,
}: {
  year: number;
  month: number;
  sessionDates: Map<string, SessionEntry[]>;
  gaps: Map<string, number>;
}) {
  const monthStart = new Date(year, month, 1);
  const monthName = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDay = monthStart.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">{monthName}</div>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-[10px] text-muted-foreground/50 text-center pb-1">{wd}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const daySessions = sessionDates.get(dateStr);
          const gapDays = gaps.get(dateStr);
          return (
            <div key={i} className="relative">
              <div
                className={`h-8 rounded text-center text-[10px] flex flex-col items-center justify-center ${
                  daySessions
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-muted-foreground/30"
                }`}
                title={daySessions ? daySessions.map((s) => `${timeLabel(s.time)} (${s.status})`).join(", ") : ""}
              >
                {day}
                {daySessions && (
                  <div className="flex gap-px justify-center">
                    {daySessions.map((s, j) => (
                      <div
                        key={j}
                        className={`h-1 w-1 rounded-full ${
                          s.status === "completed" ? "bg-emerald-400"
                          : s.status === "cancelled" ? "bg-red-400"
                          : "bg-blue-400"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {gapDays && (
                <div className="mt-1 mb-2 rounded bg-amber-500/10 border border-amber-500/20 py-1 px-1 text-center">
                  <span className="text-[10px] font-medium text-amber-400">{gapDays} day break</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SessionCalendar({
  sessions,
  limitDays,
}: {
  sessions: { scheduledDate: string; scheduledTime: string; status: string }[];
  limitDays?: number;
}) {
  if (sessions.length === 0) {
    return <div className="text-sm text-muted-foreground py-4">No sessions recorded yet.</div>;
  }

  const sessionDates = new Map<string, SessionEntry[]>();
  for (const s of sessions) {
    if (!sessionDates.has(s.scheduledDate)) sessionDates.set(s.scheduledDate, []);
    sessionDates.get(s.scheduledDate)!.push({ time: s.scheduledTime, status: s.status });
  }

  const sorted = [...sessions].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const gaps = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].scheduledDate + "T12:00:00");
    const curr = new Date(sorted[i].scheduledDate + "T12:00:00");
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays >= 14) {
      gaps.set(sorted[i - 1].scheduledDate, diffDays);
    }
  }

  let startDate: Date;
  const endDate = new Date(sorted[sorted.length - 1].scheduledDate + "T12:00:00");

  if (limitDays) {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);
  } else {
    startDate = new Date(sorted[0].scheduledDate + "T12:00:00");
  }

  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  const months: { year: number; month: number }[] = [];
  const cursor = new Date(startMonth);
  while (cursor <= endMonth) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="space-y-6">
      {months.map(({ year, month }) => (
        <MonthGrid
          key={`${year}-${month}`}
          year={year}
          month={month}
          sessionDates={sessionDates}
          gaps={gaps}
        />
      )).reverse()}
    </div>
  );
}
