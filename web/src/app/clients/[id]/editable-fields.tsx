"use client";

import { useTransition, useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { updateClientField } from "../actions";

function EditableText({
  clientId,
  field,
  value,
  className = "",
  inputClassName = "",
}: {
  clientId: number;
  field: string;
  value: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (text !== value) {
      startTransition(() => {
        updateClientField(clientId, field, text);
      });
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setText(value); setEditing(false); }
        }}
        className={`bg-transparent border-b border-accent outline-none ${inputClassName}`}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:border-b hover:border-dashed hover:border-muted-foreground transition-colors ${isPending ? "opacity-50" : ""} ${className}`}
    >
      {text || <span className="text-muted-foreground italic">Click to set</span>}
    </span>
  );
}

function EditableNumber({
  clientId,
  field,
  value,
  min,
  max,
}: {
  clientId: number;
  field: string;
  value: number;
  min: number;
  max: number;
}) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(value);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (num !== value) {
      startTransition(() => {
        updateClientField(clientId, field, num);
      });
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        value={num}
        onChange={(e) => setNum(parseInt(e.target.value) || min)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setNum(value); setEditing(false); }
        }}
        className="bg-transparent border-b border-accent outline-none w-16 text-sm"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:border-b hover:border-dashed hover:border-muted-foreground transition-colors ${isPending ? "opacity-50" : ""}`}
    >
      {num}
    </span>
  );
}

function EditableSelect({
  clientId,
  field,
  value,
  options,
}: {
  clientId: number;
  field: string;
  value: string;
  options: { value: string; label: string; className?: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const current = options.find((o) => o.value === value);

  return (
    <select
      value={value}
      onChange={(e) => {
        startTransition(() => {
          updateClientField(clientId, field, e.target.value);
        });
      }}
      className={`bg-transparent border-0 outline-none cursor-pointer text-sm font-medium appearance-none pr-4 ${isPending ? "opacity-50" : ""} ${current?.className ?? ""}`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' fill='%236b7280' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 2.5L4 5.5L7 2.5' stroke='%236b7280' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right center" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function EditableToggle({
  clientId,
  field,
  value,
  label,
}: {
  clientId: number;
  field: string;
  value: boolean;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className={`flex items-center gap-2 cursor-pointer ${isPending ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          startTransition(() => {
            updateClientField(clientId, field, e.target.checked);
          });
        }}
        className="h-4 w-4 rounded border-border"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function EditableDays({
  clientId,
  value,
  availableDays,
  frequencies,
}: {
  clientId: number;
  value: string[];
  availableDays?: string[];
  frequencies?: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const defaultDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const days = availableDays && availableDays.length > 0
    ? defaultDays.filter((d) => availableDays.includes(d))
    : defaultDays;

  const toggle = (day: string) => {
    const updated = value.includes(day)
      ? value.filter((d) => d !== day)
      : [...value, day];
    startTransition(() => {
      updateClientField(clientId, "preferredDays", JSON.stringify(updated));
    });
  };

  const maxFreq = frequencies ? Math.max(...Object.values(frequencies), 0) : 0;

  return (
    <div className={`flex gap-1.5 flex-wrap ${isPending ? "opacity-50" : ""}`}>
      {days.map((day) => {
        const freq = frequencies?.[day] ?? 0;
        const isSelected = value.includes(day);
        const intensity = maxFreq > 0 ? freq / maxFreq : 0;
        return (
          <button
            key={day}
            onClick={() => toggle(day)}
            className={`px-2 py-0.5 rounded text-xs font-medium capitalize transition-colors ${
              isSelected ? "bg-accent/20 text-accent" : ""
            } hover:opacity-80`}
            style={!isSelected ? {
              backgroundColor: `rgba(96, 165, 250, ${0.05 + intensity * 0.3})`,
              color: `rgba(96, 165, 250, ${0.4 + intensity * 0.6})`,
            } : undefined}
          >
            {day.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

function EditableScoreBar({
  clientId,
  score,
}: {
  clientId: number;
  score: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className={`flex gap-1 ${isPending ? "opacity-50" : ""}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <button
          key={i}
          onClick={() => {
            const newScore = i + 1;
            if (newScore !== score) {
              startTransition(() => {
                updateClientField(clientId, "behaviorScore", newScore);
              });
            }
          }}
          className={`h-5 w-2.5 rounded-sm transition-colors cursor-pointer hover:opacity-70 ${
            i < score ? "bg-blue-500" : "bg-muted hover:bg-muted-foreground/20"
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{score}/10</span>
    </div>
  );
}

const DEFAULT_TIME_SLOTS = [
  "8am", "9am", "10am", "11am", "12pm",
  "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm",
];

function EditableTime({
  clientId,
  value,
  availableSlots,
  frequencies,
}: {
  clientId: number;
  value: string;
  availableSlots?: string[];
  frequencies?: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const current = value?.toLowerCase() ?? "";
  const slots = availableSlots && availableSlots.length > 0
    ? availableSlots
    : DEFAULT_TIME_SLOTS;

  const toggle = (slot: string) => {
    const newValue = current === slot ? "" : slot;
    startTransition(() => {
      updateClientField(clientId, "preferredTime", newValue);
    });
  };

  const maxFreq = frequencies ? Math.max(...Object.values(frequencies), 0) : 0;

  return (
    <div className={`grid grid-cols-6 gap-1.5 ${isPending ? "opacity-50" : ""}`}>
      {slots.map((slot) => {
        const freq = frequencies?.[slot] ?? 0;
        const isSelected = current === slot;
        const intensity = maxFreq > 0 ? freq / maxFreq : 0;
        return (
          <button
            key={slot}
            onClick={() => toggle(slot)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors text-center ${
              isSelected ? "bg-accent/20 text-accent" : ""
            } hover:opacity-80`}
            style={!isSelected ? {
              backgroundColor: `rgba(96, 165, 250, ${0.05 + intensity * 0.3})`,
              color: `rgba(96, 165, 250, ${0.4 + intensity * 0.6})`,
            } : undefined}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}

export {
  EditableText,
  EditableNumber,
  EditableSelect,
  EditableToggle,
  EditableDays,
  EditableTime,
  EditableScoreBar,
};
