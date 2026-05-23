"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const DISMISS_KEY = "weekly-planner-dismissed";
const DISMISS_WEEK_KEY = "weekly-planner-dismissed-week";

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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74L12 2z" />
      <path d="M18 14l1.05 3.15L22 18.2l-2.95.85L18 22.2l-1.05-3.15L14 18.2l2.95-.85L18 14z" opacity={0.6} />
    </svg>
  );
}

function PaperAirplaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const stepIcons = [ClockIcon, SparkleIcon, PaperAirplaneIcon, CheckIcon];

export function WeeklyPlanner({ state }: { state: PlannerState }) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedWeek = localStorage.getItem(DISMISS_WEEK_KEY);
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "true";
    if (wasDismissed && savedWeek === state.weekLabel) {
      setDismissed(true);
    } else if (wasDismissed && savedWeek !== state.weekLabel) {
      // New week -- clear the dismissal so it shows again
      localStorage.removeItem(DISMISS_KEY);
      localStorage.removeItem(DISMISS_WEEK_KEY);
    }
  }, [state.weekLabel]);

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

  if (allDone) return null;
  if (!mounted) return null;
  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "true");
    localStorage.setItem(DISMISS_WEEK_KEY, state.weekLabel);
  }

  return (
    <Card className="mb-6 border-emerald-500/20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/8 to-transparent" />
      <CardContent className="relative pt-5 pb-4">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Dismiss planner"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-emerald-400" />
              Plan the week
            </div>
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
          {steps.map((step, i) => {
            const StepIcon = stepIcons[i];
            return (
              <Link key={step.label} href={step.href}>
                <div className={`rounded-lg p-2.5 text-center transition-all cursor-pointer ${
                  step.done
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : step.active
                      ? "bg-emerald-500/10 border border-emerald-500/30 ring-1 ring-emerald-500/20"
                      : "bg-muted/50 border border-transparent"
                }`}>
                  <div className={`flex items-center justify-center gap-1 text-xs font-semibold ${
                    step.done ? "text-emerald-400" : step.active ? "text-emerald-400" : "text-muted-foreground/60"
                  }`}>
                    <StepIcon className="w-3.5 h-3.5" />
                    {step.done ? "✓" : step.label.split(". ")[0] + "."}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${
                    step.done ? "text-emerald-400/70" : step.active ? "text-foreground" : "text-muted-foreground/40"
                  }`}>
                    {step.done ? step.label.split(". ")[1] : step.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
