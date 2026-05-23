"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client } from "@/db/schema";

const CATEGORIES = [
  { value: "active", label: "Active" },
  { value: "in_season", label: "In Season" },
  { value: "on_break", label: "On Break" },
  { value: "vacation", label: "Vacation" },
  { value: "inactive", label: "Inactive" },
];

const GRADES = [
  { value: "freshman", label: "Freshman" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "post_grad", label: "Post-Grad" },
  { value: "adult", label: "Adult" },
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function ClientForm({
  client,
  action,
  submitLabel,
}: {
  client?: Client;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const preferredDays: string[] = client?.preferredDays
    ? JSON.parse(client.preferredDays)
    : [];

  return (
    <form action={action} className="space-y-5 max-w-lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={client?.name ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={client?.phone ?? ""} required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Status</Label>
          <Select name="category" defaultValue={client?.category ?? "active"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="gradeLevel">Grade</Label>
          <Select name="gradeLevel" defaultValue={client?.gradeLevel ?? ""}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="behaviorScore">Effort Score (1-10)</Label>
          <Input
            id="behaviorScore"
            name="behaviorScore"
            type="number"
            min={1}
            max={10}
            defaultValue={client?.behaviorScore ?? 5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxSessionsPerWeek">Max Sessions/Week</Label>
          <Input
            id="maxSessionsPerWeek"
            name="maxSessionsPerWeek"
            type="number"
            min={1}
            max={7}
            defaultValue={client?.maxSessionsPerWeek ?? 1}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="collegeBound"
          name="collegeBound"
          defaultChecked={client?.collegeBound ?? false}
          className="h-4 w-4 rounded border-border"
        />
        <Label htmlFor="collegeBound">College-bound athlete</Label>
      </div>

      <div className="space-y-2">
        <Label>Preferred Days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label key={day} className="flex items-center gap-1.5 text-sm capitalize">
              <input
                type="checkbox"
                name={`day_${day}`}
                defaultChecked={preferredDays.includes(day)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
        <input
          type="hidden"
          name="preferredDays"
          id="preferredDaysHidden"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="preferredTime">Preferred Time</Label>
        <Input
          id="preferredTime"
          name="preferredTime"
          defaultValue={client?.preferredTime ?? ""}
          placeholder="e.g. 3pm, 5pm, M 12pm / W 12pm / F 1:15pm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="standingSlot">Standing Slot</Label>
        <Input
          id="standingSlot"
          name="standingSlot"
          defaultValue={client?.standingSlot ?? ""}
          placeholder="e.g. Mon 3pm, Wed 3pm — auto-fills each week"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={client?.notes ?? ""}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <Button
        type="submit"
        onClick={(e) => {
          const form = (e.target as HTMLElement).closest("form")!;
          const checked = DAYS.filter(
            (d) => (form.querySelector(`[name="day_${d}"]`) as HTMLInputElement)?.checked
          );
          (form.querySelector("#preferredDaysHidden") as HTMLInputElement).value =
            JSON.stringify(checked);
        }}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
