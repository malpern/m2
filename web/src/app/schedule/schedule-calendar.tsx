"use client";

import { useRef, useTransition, useState } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import {
  generateSchedule,
  updateSessionTime,
  exportICS,
} from "./actions";

interface SessionEvent {
  id: number;
  clientId: number;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
}

function statusColor(status: string) {
  switch (status) {
    case "confirmed":
      return { backgroundColor: "#34d399", borderColor: "#34d399" };
    case "proposed":
      return { backgroundColor: "#6c8cff", borderColor: "#6c8cff" };
    case "completed":
      return { backgroundColor: "#22d3ee", borderColor: "#22d3ee" };
    case "cancelled":
      return { backgroundColor: "#f87171", borderColor: "#f87171" };
    default:
      return { backgroundColor: "#6c8cff", borderColor: "#6c8cff" };
  }
}

export function ScheduleCalendar({
  sessions,
  weekStart,
}: {
  sessions: SessionEvent[];
  weekStart: string;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const prevDate = new Date(weekStart + "T12:00:00");
  prevDate.setDate(prevDate.getDate() - 7);
  const prevWeek = prevDate.toISOString().split("T")[0];

  const nextDate = new Date(weekStart + "T12:00:00");
  nextDate.setDate(nextDate.getDate() + 7);
  const nextWeek = nextDate.toISOString().split("T")[0];

  const events: EventInput[] = sessions.map((s) => ({
    id: String(s.id),
    title: s.clientName,
    start: `${s.scheduledDate}T${s.scheduledTime}`,
    end: `${s.scheduledDate}T${String(parseInt(s.scheduledTime.split(":")[0]) + 1).padStart(2, "0")}:${s.scheduledTime.split(":")[1]}`,
    extendedProps: { status: s.status, clientId: s.clientId },
    ...statusColor(s.status),
  }));

  const handleGenerate = () => {
    startTransition(() => {
      generateSchedule(weekStart);
    });
  };

  const handleDrop = (info: { event: { id: string; start: Date | null } }) => {
    const sessionId = parseInt(info.event.id);
    const newDate = info.event.start!.toISOString().split("T")[0];
    const hours = String(info.event.start!.getHours()).padStart(2, "0");
    const mins = String(info.event.start!.getMinutes()).padStart(2, "0");
    startTransition(() => {
      updateSessionTime(sessionId, newDate, `${hours}:${mins}`);
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    const ics = await exportICS(weekStart);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `m2-schedule-${weekStart}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <div className="flex items-center gap-3 mt-1">
            <Link href={`/schedule?week=${prevWeek}`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">&larr;</Button>
            </Link>
            <span className="text-muted-foreground text-sm">
              Week of {new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
            <Link href={`/schedule?week=${nextWeek}`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">&rarr;</Button>
            </Link>
            <Link href="/schedule">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">Today</Button>
            </Link>
            {isPending && <span className="text-blue-400 text-sm">Updating...</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/schedule/availability">
            <Button variant="outline" size="sm">Availability</Button>
          </Link>
          <Button onClick={handleGenerate} disabled={isPending} size="sm">
            Generate Week
          </Button>
          <Button onClick={handleExport} disabled={isExporting} variant="outline" size="sm">
            {isExporting ? "Exporting..." : "Export .ics"}
          </Button>
          <Link href="/outreach">
            <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              Outreach &rarr;
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4 [&_.fc]:text-sm [&_.fc-timegrid-slot]:h-12 [&_.fc-col-header-cell]:py-2 [&_.fc-col-header-cell]:text-xs [&_.fc-col-header-cell]:uppercase [&_.fc-col-header-cell]:tracking-wider [&_.fc-col-header-cell]:text-muted-foreground [&_.fc-col-header-cell]:font-semibold [&_.fc-timegrid-slot-label]:text-xs [&_.fc-timegrid-slot-label]:text-muted-foreground [&_.fc-event]:rounded-md [&_.fc-event]:px-2 [&_.fc-event]:py-1 [&_.fc-event]:text-xs [&_.fc-event]:font-semibold [&_.fc-event]:cursor-grab [&_.fc-event]:border-0 [&_.fc-scrollgrid]:border-border [&_.fc-scrollgrid td]:border-border [&_.fc-scrollgrid th]:border-border [&_.fc-timegrid-divider]:hidden [&_.fc-day-today]:bg-accent/5">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={weekStart}
          headerToolbar={false}
          slotMinTime="12:00:00"
          slotMaxTime="20:00:00"
          slotDuration="01:00:00"
          allDaySlot={false}
          editable={true}
          eventDrop={handleDrop}
          events={events}
          height="auto"
          hiddenDays={[6]}
          dayHeaderFormat={{ weekday: "short", month: "numeric", day: "numeric" }}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        />
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#6c8cff]" />
          Proposed
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#34d399]" />
          Confirmed
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#22d3ee]" />
          Completed
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#f87171]" />
          Cancelled
        </div>
      </div>
    </div>
  );
}
