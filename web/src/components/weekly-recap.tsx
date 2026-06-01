import { Card, CardContent } from "@/components/ui/card";

export function WeeklyRecap({
  completed,
  cancelled,
  noShow,
}: {
  completed: number;
  cancelled: number;
  noShow: number;
}) {
  const total = completed + cancelled + noShow;
  if (total <= 3) return null;

  const showUpRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card className="mt-4">
      <CardContent className="pt-5 pb-4">
        <div className="text-xs text-muted-foreground mb-2">This week</div>
        <div className="flex items-center gap-6 text-sm">
          <span><strong>{completed}</strong> completed</span>
          {cancelled > 0 && <span className="text-red-400">{cancelled} cancelled</span>}
          {noShow > 0 && <span className="text-amber-400">{noShow} no-show</span>}
          <span className="text-emerald-400">{showUpRate}% show-up</span>
        </div>
      </CardContent>
    </Card>
  );
}
