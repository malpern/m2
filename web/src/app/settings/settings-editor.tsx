"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOutreachSettings, saveOutreachSettings, type OutreachSettings } from "./actions";

const DAYS = [
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
  { value: "friday", label: "Friday" },
  { value: "monday", label: "Monday" },
];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6).map((h) => ({
  value: h,
  label: h <= 12 ? `${h === 0 ? 12 : h}:00 AM` : `${h - 12}:00 PM`,
}));

function NumberStepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold transition-colors"
        aria-label="Decrease value"
      >
        −
      </button>
      <span className="text-lg font-bold w-10 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold transition-colors"
        aria-label="Increase value"
      >
        +
      </button>
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function SettingsEditor() {
  const [settings, setSettings] = useState<OutreachSettings | null>(null);
  const [initial, setInitial] = useState<OutreachSettings | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const s = await getOutreachSettings();
      setSettings(s);
      setInitial(s);
    });
  }, []);

  if (!settings || !initial) return null;

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(initial);

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      await saveOutreachSettings(settings);
      setInitial(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const update = (key: keyof OutreachSettings, value: number | string) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div>
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-6">
          <div>
            <h3 className="font-semibold text-sm mb-1">Outreach Day &amp; Time</h3>
            <p className="text-xs text-muted-foreground mb-3">When do you want to start texting each week?</p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={settings.outreachDay}
                onChange={(e) => update("outreachDay", e.target.value)}
                aria-label="Outreach day"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <span className="text-sm text-muted-foreground">at</span>
              <select
                value={settings.outreachHour}
                onChange={(e) => update("outreachHour", parseInt(e.target.value))}
                aria-label="Outreach hour"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Wave 1 — First texts</h3>
            <p className="text-xs text-muted-foreground mb-3">How many people to text first? These are your highest-priority clients, most likely to fill slots.</p>
            <NumberStepper
              value={settings.wave1Size}
              onChange={(v) => update("wave1Size", v)}
              min={1}
              max={20}
              suffix="clients"
            />
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Wave 2 — Second round</h3>
            <p className="text-xs text-muted-foreground mb-3">How long to wait before sending the next batch? They go out whether or not Wave 1 has replied.</p>
            <NumberStepper
              value={settings.wave2DelayMinutes}
              onChange={(v) => update("wave2DelayMinutes", v)}
              min={15}
              max={120}
              suffix="minutes"
            />
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Wave 3 — Everyone else</h3>
            <p className="text-xs text-muted-foreground mb-3">How long before sending the rest? For people who haven&apos;t been reached yet.</p>
            <NumberStepper
              value={settings.wave3DelayMinutes}
              onChange={(v) => update("wave3DelayMinutes", v)}
              min={30}
              max={300}
              suffix="minutes"
            />
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Follow-up</h3>
            <p className="text-xs text-muted-foreground mb-3">If someone doesn&apos;t reply, when should the system follow up?</p>
            <NumberStepper
              value={settings.followUpAfterMinutes}
              onChange={(v) => update("followUpAfterMinutes", v)}
              min={15}
              max={240}
              suffix="minutes"
            />
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Move on</h3>
            <p className="text-xs text-muted-foreground mb-3">If still no reply after following up, when should the system give up and offer the slot to someone else?</p>
            <NumberStepper
              value={settings.moveOnAfterMinutes}
              onChange={(v) => update("moveOnAfterMinutes", v)}
              min={60}
              max={480}
              suffix="minutes"
            />
          </div>
          <Separator />

          <div>
            <h3 className="font-semibold text-sm mb-1">Day-of session reminders</h3>
            <p className="text-xs text-muted-foreground mb-3">Send a &ldquo;See you today!&rdquo; text at 9am Pacific on session day. You can also enable this per-client on their profile.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sessionRemindersGlobal}
                onChange={(e) => update("sessionRemindersGlobal", e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm">Enable for all active clients</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {hasChanges && (
          <Button variant="ghost" size="sm" onClick={() => setSettings(initial)}>
            Discard
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !hasChanges}>
          {isPending ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}
