"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { toggleDefaultSlot, setWeeklyOverride, sendVacationNotice } from "./actions";

type SlotData = {
  id: number;
  day: string;
  slot: string;
  enabled: boolean;
};

type OverrideData = {
  day: string;
  slot: string;
  enabled: boolean;
  note: string | null;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", sunday: "Sun",
};

function SlotChip({
  slot,
  enabled,
  overridden,
  onToggle,
}: {
  slot: string;
  enabled: boolean;
  overridden?: boolean;
  onToggle: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(onToggle)}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
        isPending ? "opacity-40" : ""
      } ${
        enabled
          ? "bg-accent/25 text-foreground hover:bg-accent/35"
          : "bg-muted text-muted-foreground/30 hover:bg-muted/80 line-through"
      } ${overridden ? "ring-1 ring-amber-400/50" : ""}`}
    >
      {slot}
    </button>
  );
}

export function DefaultAvailabilityGrid({ slots }: { slots: SlotData[] }) {
  const slotsByDay = DAYS.map((day) => ({
    day,
    slots: slots.filter((s) => s.day === day),
  }));

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">Default Availability</h2>
      <p className="text-sm text-muted-foreground mb-6">Your regular weekly template. Click a slot to turn it on or off.</p>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {slotsByDay.map(({ day, slots: daySlots }) => (
          <div key={day}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
              {DAY_LABELS[day]}
            </div>
            <div className="flex flex-col gap-2">
              {daySlots.map((s) => (
                <SlotChip
                  key={s.id}
                  slot={s.slot}
                  enabled={s.enabled}
                  onToggle={() => toggleDefaultSlot(s.id, !s.enabled)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeeklyOverrideGrid({
  defaults,
  overrides,
  weekOf,
  weekLabel,
}: {
  defaults: SlotData[];
  overrides: OverrideData[];
  weekOf: string;
  weekLabel: string;
}) {
  const getEffective = (day: string, slot: string): boolean => {
    const override = overrides.find((o) => o.day === day && o.slot === slot);
    if (override) return override.enabled;
    const def = defaults.find((d) => d.day === day && d.slot === slot);
    return def?.enabled ?? false;
  };

  const isOverridden = (day: string, slot: string): boolean => {
    return overrides.some((o) => o.day === day && o.slot === slot);
  };

  const allSlots = [...new Set(defaults.map((d) => d.slot))].sort();

  const slotsByDay = DAYS.map((day) => ({
    day,
    slots: allSlots
      .filter((slot) => defaults.some((d) => d.day === day && d.slot === slot))
      .map((slot) => ({
        slot,
        enabled: getEffective(day, slot),
        overridden: isOverridden(day, slot),
      })),
  }));

  const allDisabled = slotsByDay.every(({ slots }) => slots.every((s) => !s.enabled));
  const [notifySending, startNotify] = useTransition();
  const [notified, setNotified] = useState(false);
  const toast = useToast();

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">Week of {weekLabel}</h2>
      <p className="text-sm text-muted-foreground mb-6">Adjust for this specific week. Changes here don&apos;t affect your default schedule. Orange ring = overridden.</p>

      {allDisabled && !notified && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-400">Vacation week detected</div>
            <div className="text-xs text-muted-foreground">All slots are off. Want to let your clients know?</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={notifySending}
            onClick={() => {
              startNotify(async () => {
                const result = await sendVacationNotice(weekOf, weekLabel);
                setNotified(true);
                toast(`Notified ${result.sent} clients`);
              });
            }}
          >
            {notifySending ? "Sending..." : "Notify clients"}
          </Button>
        </div>
      )}
      {notified && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
          Clients have been notified about this vacation week.
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {slotsByDay.map(({ day, slots }) => (
          <div key={day}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
              {DAY_LABELS[day]}
            </div>
            <div className="flex flex-col gap-2">
              {slots.map((s) => (
                <SlotChip
                  key={`${day}-${s.slot}`}
                  slot={s.slot}
                  enabled={s.enabled}
                  overridden={s.overridden}
                  onToggle={() =>
                    setWeeklyOverride(weekOf, day, s.slot, !s.enabled)
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
