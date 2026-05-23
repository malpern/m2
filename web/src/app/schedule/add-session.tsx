"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addManualSession } from "./actions";

interface ClientOption {
  id: number;
  name: string;
}

export function AddSessionButton({
  clients,
  weekStart,
}: {
  clients: ClientOption[];
  weekStart: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(weekStart);
  const [time, setTime] = useState("15:00");

  const handleSubmit = () => {
    if (!clientId) return;
    startTransition(() => {
      addManualSession(parseInt(clientId), date, time);
    });
    setOpen(false);
    setClientId("");
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add Session
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-lg font-bold mb-4">Add Session</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Time</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="10:00">10:00 AM</option>
              <option value="11:00">11:00 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="13:00">1:00 PM</option>
              <option value="14:00">2:00 PM</option>
              <option value="15:00">3:00 PM</option>
              <option value="16:00">4:00 PM</option>
              <option value="17:00">5:00 PM</option>
              <option value="18:00">6:00 PM</option>
              <option value="19:00">7:00 PM</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!clientId || isPending}>
            {isPending ? "Adding..." : "Add Session"}
          </Button>
        </div>
      </div>
    </div>
  );
}
