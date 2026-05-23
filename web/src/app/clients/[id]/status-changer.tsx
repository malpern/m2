"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateClientStatus } from "../actions";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "in_season", label: "In Season" },
  { value: "on_break", label: "On Break" },
  { value: "vacation", label: "Vacation" },
  { value: "inactive", label: "Inactive" },
];

export function StatusChanger({
  clientId,
  currentStatus,
}: {
  clientId: number;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={currentStatus}
      onValueChange={(value) => {
        if (!value) return;
        startTransition(() => {
          updateClientStatus(clientId, value);
        });
      }}
    >
      <SelectTrigger className="h-7 w-auto text-xs gap-1 border-0 bg-muted/50 hover:bg-muted">
        <SelectValue />
        {isPending && <span className="text-muted-foreground">...</span>}
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
