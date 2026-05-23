"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface PlannerState {
  hasAvailability: boolean;
  hasProposedSessions: boolean;
  totalClients: number;
  confirmedCount: number;
  proposedCount: number;
  sentCount: number;
  needsAttentionCount: number;
  weekLabel: string;
}

type Step = {
  label: string;
  description: string;
  href: string;
  done: boolean;
  active: boolean;
};

export function WeeklyPlanner({ state }: { state: PlannerState }) {
  const bookedCount = state.confirmedCount;
  const totalToBook = state.totalClients;
  const bookedPct = totalToBook > 0 ? Math.round((bookedCount / totalToBook) * 100) : 0;

  const steps: Step[] = [
    {
      label: "1. Availability",
      description: "Confirm your hours",
      href: "/schedule/availability",
      done: state.hasAvailability,
      active: !state.hasAvailability,
    },
    {
      label: "2. Generate",
      description: "Fill the schedule",
      href: "/schedule",
      done: state.hasProposedSessions,
      active: state.hasAvailability && !state.hasProposedSessions,
    },
    {
      label: "3. Send",
      description: "Text your athletes",
      href: "/outreach",
      done: state.sentCount > 0 || state.confirmedCount > 0,
      active: state.hasProposedSessions && state.sentCount === 0 && state.confirmedCount === 0,
    },
    {
      label: "4. Book",
      description: state.needsAttentionCount > 0
        ? `${state.needsAttentionCount} need you`
        : bookedCount === totalToBook
          ? "All booked!"
          : `${bookedCount} of ${totalToBook}`,
      href: "/outreach",
      done: bookedCount === totalToBook && totalToBook > 0,
      active: (state.sentCount > 0 || state.confirmedCount > 0) && bookedCount < totalToBook,
    },
  ];

  const allDone = steps.every((s) => s.done);
  const currentStep = steps.find((s) => s.active);

  if (allDone) return null;

  return (
    <Card className="mb-6 border-accent/20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-transparent" />
      <CardContent className="relative pt-5 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-semibold">Plan the week</div>
            <div className="text-xs text-muted-foreground">Week of {state.weekLabel}</div>
          </div>
          {totalToBook > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold">{bookedPct}%</div>
                <div className="text-[10px] text-muted-foreground">booked</div>
              </div>
              <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${bookedPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {steps.map((step) => (
            <Link key={step.label} href={step.href}>
              <div className={`rounded-lg p-2.5 text-center transition-all cursor-pointer ${
                step.done
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : step.active
                    ? "bg-accent/10 border border-accent/30 ring-1 ring-accent/20"
                    : "bg-muted/50 border border-transparent"
              }`}>
                <div className={`text-xs font-semibold ${
                  step.done ? "text-emerald-400" : step.active ? "text-accent" : "text-muted-foreground/60"
                }`}>
                  {step.done ? "✓" : step.label.split(". ")[0] + "."}
                </div>
                <div className={`text-[11px] mt-0.5 ${
                  step.done ? "text-emerald-400/70" : step.active ? "text-foreground" : "text-muted-foreground/40"
                }`}>
                  {step.done ? step.label.split(". ")[1] : step.description}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
