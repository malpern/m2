import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export function WeekRecap({
  completed,
  cancelled,
  noShow,
  unreconciled,
}: {
  completed: number;
  cancelled: number;
  noShow: number;
  unreconciled: number;
}) {
  const total = completed + cancelled + noShow;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card className="mb-4">
      <CardContent className="pt-5 pb-4">
        <div className="text-sm font-semibold mb-3">This week</div>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-2xl font-bold">{completed}</div>
            <div className="text-xs text-muted-foreground">completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">{rate}%</div>
            <div className="text-xs text-muted-foreground">show-up rate</div>
          </div>
          {cancelled > 0 && (
            <div>
              <div className="text-2xl font-bold text-red-400">{cancelled}</div>
              <div className="text-xs text-muted-foreground">cancelled</div>
            </div>
          )}
          {noShow > 0 && (
            <div>
              <div className="text-2xl font-bold text-amber-400">{noShow}</div>
              <div className="text-xs text-muted-foreground">no-show</div>
            </div>
          )}
        </div>
        {unreconciled > 0 && (
          <Link href="/reports" className="block mt-3 text-xs text-red-400 hover:underline">
            {unreconciled} session{unreconciled !== 1 ? "s" : ""} not deducted from packages &rarr;
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
