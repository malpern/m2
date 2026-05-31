import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateEvent = vi.fn();
const mockDeleteEvent = vi.fn();
const mockIsConnected = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockSyslog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: () => ({
      set: () => ({
        where: () => ({
          run: () => {},
        }),
      }),
    }),
  },
}));

function mockSessionLookup(session: Record<string, unknown>) {
  let callCount = 0;
  mockDbSelect.mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({ get: () => session }),
          }),
        }),
      };
    }
    return {
      from: () => ({
        where: () => ({ get: () => ({ status: session.status }) }),
      }),
    };
  });
}

vi.mock("@/db/schema", () => ({
  sessions: { id: "id", gcalEventId: "gcal_event_id", clientId: "client_id" },
  clients: { id: "id", name: "name" },
}));

vi.mock("@/lib/google-calendar", () => ({
  createCalendarEvent: (...args: unknown[]) => mockCreateEvent(...args),
  deleteCalendarEvent: (...args: unknown[]) => mockDeleteEvent(...args),
  isConnected: () => mockIsConnected(),
}));

vi.mock("@/lib/logger", () => ({
  syslog: mockSyslog,
}));

const { syncSessionToCalendar } = await import("./gcal-sync");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncSessionToCalendar", () => {
  it("does nothing when Google Calendar is not connected", async () => {
    mockIsConnected.mockResolvedValue({ connected: false });

    await syncSessionToCalendar(1);

    expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });

  it("creates event when session is confirmed and has no gcalEventId", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockSessionLookup({
      id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
      scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "confirmed", gcalEventId: null,
    });
    mockCreateEvent.mockResolvedValue("evt_123");

    await syncSessionToCalendar(1);

    expect(mockCreateEvent).toHaveBeenCalledWith("John Smith", "2026-06-05", "15:00", { attendeeEmail: undefined });
    expect(mockSyslog.info).toHaveBeenCalled();
  });

  it("does not create event when session already has gcalEventId", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            get: () => ({
              id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
              scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "confirmed", gcalEventId: "existing_evt",
            }),
          }),
        }),
      }),
    });

    await syncSessionToCalendar(1);

    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it("deletes event when session is cancelled and has gcalEventId", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            get: () => ({
              id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
              scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "cancelled", gcalEventId: "evt_to_delete",
            }),
          }),
        }),
      }),
    });
    mockDeleteEvent.mockResolvedValue(true);

    await syncSessionToCalendar(1);

    expect(mockDeleteEvent).toHaveBeenCalledWith("evt_to_delete");
    expect(mockSyslog.info).toHaveBeenCalled();
  });

  it("does not delete when cancelled session has no gcalEventId", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            get: () => ({
              id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
              scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "cancelled", gcalEventId: null,
            }),
          }),
        }),
      }),
    });

    await syncSessionToCalendar(1);

    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });

  it("deletes event immediately if session was cancelled during creation", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({ get: () => ({
                id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
                scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "confirmed", gcalEventId: null,
              }) }),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({ get: () => ({ status: "cancelled" }) }),
        }),
      };
    });
    mockCreateEvent.mockResolvedValue("evt_race");
    mockDeleteEvent.mockResolvedValue(true);

    await syncSessionToCalendar(1);

    expect(mockCreateEvent).toHaveBeenCalled();
    expect(mockDeleteEvent).toHaveBeenCalledWith("evt_race");
    expect(mockSyslog.info).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("cancelled while creating"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("logs warning when createCalendarEvent returns null", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ get: () => ({
            id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
            scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "confirmed", gcalEventId: null,
          }) }),
        }),
      }),
    });
    mockCreateEvent.mockResolvedValue(null);

    await syncSessionToCalendar(1);

    expect(mockSyslog.warn).toHaveBeenCalledWith(
      "system",
      expect.stringContaining("returned empty"),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("logs error when create fails", async () => {
    mockIsConnected.mockResolvedValue({ connected: true });
    mockDbSelect.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            get: () => ({
              id: 1, clientName: "John Smith", clientEmail: null, calendarInviteOptIn: null,
              scheduledDate: "2026-06-05", scheduledTime: "15:00", slot: "3pm", status: "confirmed", gcalEventId: null,
            }),
          }),
        }),
      }),
    });
    mockCreateEvent.mockRejectedValue(new Error("API error"));

    await syncSessionToCalendar(1);

    expect(mockSyslog.error).toHaveBeenCalled();
  });
});
