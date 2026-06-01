import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PackageAdjustmentForm } from "./package-adjustment-form";

interface PackageRow {
  id: number;
  totalSessions: number;
  sessionsUsed: number;
  pricePerSession: number | null;
  status: string;
}

interface TransactionRow {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string | null;
}

export function ClientPackageCard({
  clientId,
  activePackage,
  transactionHistory,
}: {
  clientId: number;
  activePackage: PackageRow | undefined;
  transactionHistory: TransactionRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Package</CardTitle>
      </CardHeader>
      <CardContent>
        {activePackage ? (
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Sessions Remaining</div>
                <div className="text-4xl font-bold mt-1">
                  {activePackage.totalSessions - activePackage.sessionsUsed}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{activePackage.sessionsUsed} used</div>
                <div>{activePackage.totalSessions} total</div>
                {activePackage.pricePerSession && (
                  <div className="text-foreground font-medium">${(activePackage.pricePerSession / 100).toFixed(0)}/session</div>
                )}
              </div>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  activePackage.totalSessions - activePackage.sessionsUsed <= 2
                    ? "bg-red-500"
                    : activePackage.totalSessions - activePackage.sessionsUsed <= 4
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{
                  width: `${((activePackage.totalSessions - activePackage.sessionsUsed) / activePackage.totalSessions) * 100}%`,
                }}
              />
            </div>
            {activePackage.totalSessions - activePackage.sessionsUsed <= 2 && (
              <div className="text-sm text-red-400 font-medium">Package almost exhausted</div>
            )}

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Recent Transactions</div>
              {transactionHistory.length > 0 ? (
                <div className="space-y-1.5">
                  {transactionHistory.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-xs font-medium ${tx.delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {tx.delta > 0 ? "+" : ""}{tx.delta}
                        </span>
                        <span className="text-muted-foreground capitalize">
                          {tx.reason === "manual_adjustment" ? (tx.note || "manual") : tx.reason}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No package activity yet</p>
              )}
            </div>

            <Separator />

            <div>
              <div className="text-sm font-medium mb-2">Manual Adjustment</div>
              <PackageAdjustmentForm clientId={clientId} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">No active package.</div>
        )}
      </CardContent>
    </Card>
  );
}
