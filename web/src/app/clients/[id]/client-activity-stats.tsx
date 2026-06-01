import { Card, CardContent } from "@/components/ui/card";

export function ClientActivityStats({
  totalCompleted,
  totalCancelled,
  totalNoShow,
  memberSince,
}: {
  totalCompleted: number;
  totalCancelled: number;
  totalNoShow: number;
  memberSince: string;
}) {
  const total = totalCompleted + totalCancelled + totalNoShow;
  const completionRate = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <div className="text-2xl font-bold">{totalCompleted}</div>
          <div className="text-xs text-muted-foreground">Sessions</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {completionRate}%
          </div>
          <div className="text-xs text-muted-foreground">Completion</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <div className={`text-2xl font-bold ${totalNoShow > 0 ? "text-red-400" : "text-muted-foreground"}`}>{totalNoShow}</div>
          <div className="text-xs text-muted-foreground">No-Shows</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 text-center">
          <div className="text-2xl font-bold text-muted-foreground">{memberSince}</div>
          <div className="text-xs text-muted-foreground">Member since</div>
        </CardContent>
      </Card>
    </div>
  );
}
