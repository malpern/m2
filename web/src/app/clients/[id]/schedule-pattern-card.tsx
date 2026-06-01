import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function SchedulePatternCard({
  scheduleGrid,
  maxDayTimeScore,
  allTimeSlots,
  coreHours,
  totalSessions,
}: {
  scheduleGrid: Record<string, Record<string, number>>;
  maxDayTimeScore: number;
  allTimeSlots: string[];
  coreHours: Set<string>;
  totalSessions: number;
}) {
  if (totalSessions === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Schedule Pattern</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-left pb-2 pr-2 w-16" />
                {DAY_ORDER.map((day) => (
                  <th key={day} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center pb-2 px-1">
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allTimeSlots.map((time) => {
                const isEdge = !coreHours.has(time);
                return (
                  <tr key={time}>
                    <td className={`text-xs pr-2 py-0.5 text-right tabular-nums ${isEdge ? "text-muted-foreground/50 italic" : "text-muted-foreground"}`}>{time}</td>
                    {DAY_ORDER.map((day) => {
                      const count = scheduleGrid[day]?.[time] ?? 0;
                      const intensity = count / maxDayTimeScore;
                      return (
                        <td key={day} className="px-1 py-0.5 text-center">
                          <div
                            className="mx-auto h-6 rounded transition-colors"
                            style={{
                              backgroundColor: count > 0
                                ? `rgba(96, 165, 250, ${0.1 + intensity * 0.6})`
                                : "rgba(255,255,255,0.02)",
                            }}
                            title={count > 0 ? `${day.slice(0,3)} ${time}: ${count} sessions` : ""}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">Based on {totalSessions} sessions. Brighter = more frequent.</p>
      </CardContent>
    </Card>
  );
}
