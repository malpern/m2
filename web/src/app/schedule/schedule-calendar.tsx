"use client";

import { useRef, useTransition, useState, useEffect } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import {
  generateSchedule,
  updateSessionTime,
  cancelSession,
  queueNotification,
} from "./actions";

interface SessionEvent {
  id: number;
  clientId: number;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
}

interface PendingChange {
  type: "move" | "cancel";
  sessionId: number;
  clientName: string;
  oldDay: string;
  oldSlot: string;
  newDay?: string;
  newSlot?: string;
  newDate?: string;
  newTime?: string;
  draftMessage: string;
}

function formatDay(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

function formatSlot(time: string): string {
  const hour = parseInt(time.split(":")[0]);
  return hour >= 12 ? `${hour > 12 ? hour - 12 : 12}pm` : `${hour}am`;
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
    case "no_show":
      return { backgroundColor: "#f59e0b", borderColor: "#f59e0b" };
    default:
      return { backgroundColor: "#6c8cff", borderColor: "#6c8cff" };
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function NotifyDialog({
  change,
  onSend,
  onSkip,
  onCancel,
}: {
  change: PendingChange;
  onSend: (message: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState(change.draftMessage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-bold mb-2">
          {change.type === "move" ? "Session moved" : "Session cancelled"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {change.clientName}'s session was {change.type === "move"
            ? `moved from ${change.oldDay} ${change.oldSlot} to ${change.newDay} ${change.newSlot}`
            : `cancelled (${change.oldDay} ${change.oldSlot})`
          }. This session was <strong>confirmed</strong> — do you want to notify them?
        </p>

        <div className="mb-4">
          <label className="text-sm font-medium mb-1 block">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={onSkip}>
            Move without texting
          </Button>
          <Button size="sm" onClick={() => onSend(message)}>
            Send text
          </Button>
        </div>
      </div>
    </div>
  );
}

interface GoogleEvent {
  title: string;
  date: string;
  time: string;
  endTime: string;
  isTraining?: boolean;
}

export function ScheduleCalendar({
  sessions,
  weekStart,
  googleEvents = [],
  addSessionButton,
}: {
  sessions: SessionEvent[];
  weekStart: string;
  googleEvents?: GoogleEvent[];
  addSessionButton?: React.ReactNode;
}) {
  const calendarRef = useRef<FullCalendar>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [revertInfo, setRevertInfo] = useState<(() => void) | null>(null);
  const isMobile = useIsMobile();

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
    extendedProps: { status: s.status, clientId: s.clientId, source: "m2" },
    ...statusColor(s.status),
  }));

  const gCalEvents: EventInput[] = googleEvents.map((g, i) => {
    const color = g.isTraining ? "#f97316" : "#94a3b8";
    return {
      id: `gcal-${i}`,
      title: g.title,
      start: `${g.date}T${g.time}`,
      end: `${g.date}T${g.endTime}`,
      backgroundColor: color,
      borderColor: color,
      editable: false,
      extendedProps: { source: "google", isTraining: g.isTraining },
    };
  });

  const allEvents = [...events, ...gCalEvents];

  const handleGenerate = () => {
    startTransition(() => {
      generateSchedule(weekStart);
    });
  };

  const handleDrop = (info: { event: { id: string; start: Date | null; extendedProps: Record<string, unknown> }; revert: () => void }) => {
    const sessionId = parseInt(info.event.id);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const newDate = info.event.start!.toISOString().split("T")[0];
    const hours = String(info.event.start!.getHours()).padStart(2, "0");
    const mins = String(info.event.start!.getMinutes()).padStart(2, "0");
    const newTime = `${hours}:${mins}`;

    if (session.status === "confirmed") {
      const oldDay = formatDay(session.scheduledDate);
      const oldSlot = formatSlot(session.scheduledTime);
      const newDay = formatDay(newDate);
      const newSlot = formatSlot(newTime);
      const firstName = session.clientName.split(" ")[0];

      setPendingChange({
        type: "move",
        sessionId,
        clientName: session.clientName,
        oldDay,
        oldSlot,
        newDay,
        newSlot,
        newDate,
        newTime,
        draftMessage: `Hey ${firstName}, heads up — your ${oldDay} ${oldSlot} session has been moved to ${newDay} at ${newSlot}. Let me know if that works!`,
      });
      setRevertInfo(() => info.revert);
    } else {
      startTransition(() => {
        updateSessionTime(sessionId, newDate, newTime);
      });
    }
  };

  const handleEventClick = (info: { event: { id: string; extendedProps: Record<string, unknown> } }) => {
    const sessionId = parseInt(info.event.id);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    if (session.status === "confirmed" || session.status === "proposed") {
      const day = formatDay(session.scheduledDate);
      const slot = formatSlot(session.scheduledTime);
      const firstName = session.clientName.split(" ")[0];

      if (session.status === "confirmed") {
        setPendingChange({
          type: "cancel",
          sessionId,
          clientName: session.clientName,
          oldDay: day,
          oldSlot: slot,
          draftMessage: `Hey ${firstName}, I need to cancel your ${day} ${slot} session. I'll reach out to reschedule.`,
        });
      } else {
        if (confirm(`Cancel ${session.clientName}'s proposed ${day} ${slot} session?`)) {
          startTransition(() => {
            cancelSession(sessionId);
          });
        }
      }
    }
  };

  const handleNotifySend = (message: string) => {
    if (!pendingChange) return;
    startTransition(() => {
      if (pendingChange.type === "move" && pendingChange.newDate && pendingChange.newTime) {
        updateSessionTime(pendingChange.sessionId, pendingChange.newDate, pendingChange.newTime);
      } else {
        cancelSession(pendingChange.sessionId);
      }
      queueNotification(pendingChange.sessionId, message);
    });
    setPendingChange(null);
    setRevertInfo(null);
  };

  const handleNotifySkip = () => {
    if (!pendingChange) return;
    startTransition(() => {
      if (pendingChange.type === "move" && pendingChange.newDate && pendingChange.newTime) {
        updateSessionTime(pendingChange.sessionId, pendingChange.newDate, pendingChange.newTime);
      } else {
        cancelSession(pendingChange.sessionId);
      }
    });
    setPendingChange(null);
    setRevertInfo(null);
  };

  const handleNotifyCancel = () => {
    if (revertInfo) revertInfo();
    setPendingChange(null);
    setRevertInfo(null);
  };

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.changeView(isMobile ? "listWeek" : "timeGridWeek");
    }
  }, [isMobile]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(weekStart);
    }
  }, [weekStart]);

  return (
    <div>
      {pendingChange && (
        <NotifyDialog
          change={pendingChange}
          onSend={handleNotifySend}
          onSkip={handleNotifySkip}
          onCancel={handleNotifyCancel}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
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
        <div className="flex flex-wrap items-center gap-2">
          {addSessionButton}
          <Link href="/schedule/availability">
            <Button variant="outline" size="sm">Availability</Button>
          </Link>
          <Button onClick={handleGenerate} disabled={isPending} size="sm">
            Generate Week
          </Button>
          <Link href="/outreach">
            <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              Outreach &rarr;
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-3 sm:p-6" style={{ ['--fc-event-text-color' as string]: '#fff' }}>
        <style>{`
          .fc .fc-timegrid-slot { height: 80px !important; }
          .fc .fc-col-header { background: transparent !important; }
          .fc .fc-col-header-cell { padding: 12px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted) !important; font-weight: 600; background: var(--background) !important; }
          .fc .fc-col-header-cell-cushion { color: inherit !important; text-decoration: none !important; }
          .fc .fc-timegrid-axis { background: var(--background) !important; }
          .fc .fc-timegrid-slot-label { font-size: 14px; color: var(--text-muted); padding-right: 12px; background: var(--background) !important; }
          .fc .fc-timegrid-body, .fc .fc-timegrid-slots td { background: var(--background) !important; }
          .fc .fc-scrollgrid { background: var(--background) !important; }
          .fc thead, .fc tbody, .fc tr, .fc td, .fc th { background: transparent !important; }
          .fc .fc-event { border-radius: 8px !important; padding: 6px 10px !important; font-size: 14px !important; font-weight: 600 !important; cursor: grab !important; border: none !important; box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important; }
          .fc .fc-event .fc-event-title { font-size: 14px !important; font-weight: 600 !important; }
          .fc .fc-event .fc-event-time { font-size: 12px !important; opacity: 0.8; }
          .fc .fc-scrollgrid, .fc .fc-scrollgrid td, .fc .fc-scrollgrid th { border-color: var(--border) !important; }
          .fc .fc-timegrid-divider { display: none; }
          .fc .fc-day-today { background: rgba(108,140,255,0.03) !important; }
          .fc .fc-list-event-dot { border-color: inherit !important; }
          .fc .fc-list-day-cushion { background: var(--muted) !important; }
          @media (max-width: 639px) {
            .fc .fc-event { padding: 4px 6px !important; font-size: 13px !important; }
          }
        `}</style>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          initialDate={weekStart}
          headerToolbar={false}
          slotMinTime="12:00:00"
          slotMaxTime="20:00:00"
          slotDuration="01:00:00"
          allDaySlot={false}
          editable={!isMobile}
          eventDrop={handleDrop}
          eventClick={handleEventClick}
          events={allEvents}
          height="auto"
          hiddenDays={[6]}
          dayHeaderFormat={{ weekday: "short", month: "numeric", day: "numeric" }}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-4 text-xs text-muted-foreground">
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
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#f59e0b]" />
          No Show
        </div>
        {googleEvents.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#f97316]" />
              Training (Cal)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#94a3b8]" />
              Personal (Cal)
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2">Click a session to cancel it. Drag to move. Confirmed sessions will prompt you to notify the client.</p>

      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="16" width="60" height="52" rx="6" stroke="#6c8cff" strokeWidth="1.5" fill="rgba(108,140,255,0.1)" />
            <path d="M10 22C10 18.6863 12.6863 16 16 16H64C67.3137 16 70 18.6863 70 22V28H10V22Z" fill="#6c8cff" fillOpacity="0.15" stroke="#6c8cff" strokeWidth="1.5" />
            <line x1="26" y1="10" x2="26" y2="20" stroke="#6c8cff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="54" y1="10" x2="54" y2="20" stroke="#6c8cff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="10" y1="40" x2="70" y2="40" stroke="#2e3345" strokeWidth="0.75" strokeOpacity="0.3" />
            <line x1="10" y1="52" x2="70" y2="52" stroke="#2e3345" strokeWidth="0.75" strokeOpacity="0.3" />
            <line x1="30" y1="28" x2="30" y2="68" stroke="#2e3345" strokeWidth="0.75" strokeOpacity="0.3" />
            <line x1="50" y1="28" x2="50" y2="68" stroke="#2e3345" strokeWidth="0.75" strokeOpacity="0.3" />
            <rect x="30" y="40" width="20" height="12" fill="#6c8cff" fillOpacity="0.12" rx="2" />
          </svg>
          <h2 className="text-lg font-semibold text-foreground mt-5 mb-1">No sessions yet</h2>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
            Generate a schedule to fill this week with sessions for your athletes.
          </p>
          <Button size="sm" onClick={handleGenerate} disabled={isPending}>
            Generate Week
          </Button>
        </div>
      )}
    </div>
  );
}
