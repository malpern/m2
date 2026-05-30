import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  clients: { id: "id", email: "email", calendarInviteOptIn: "calendar_invite_opt_in" },
}));

const { getInvitePrompt } = await import("./invite-prompt");

function mockClient(data: { email: string | null; calendarInviteOptIn: boolean | null } | undefined) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        get: () => data,
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getInvitePrompt", () => {
  it("returns null when client is not found", async () => {
    mockClient(undefined);
    const result = await getInvitePrompt(999);
    expect(result).toBeNull();
  });

  it("returns null when calendarInviteOptIn is false (opted out)", async () => {
    mockClient({ email: "test@example.com", calendarInviteOptIn: false });
    const result = await getInvitePrompt(1);
    expect(result).toBeNull();
  });

  it("returns null when calendarInviteOptIn is true and email exists (already opted in)", async () => {
    mockClient({ email: "test@example.com", calendarInviteOptIn: true });
    const result = await getInvitePrompt(1);
    expect(result).toBeNull();
  });

  it("returns prompt with email when optIn is null and email exists", async () => {
    mockClient({ email: "test@example.com", calendarInviteOptIn: null });
    const result = await getInvitePrompt(1);
    expect(result).not.toBeNull();
    expect(result).toContain("test@example.com");
    expect(result).toContain("calendar invite");
  });

  it("returns prompt asking for email when optIn is null and no email", async () => {
    mockClient({ email: null, calendarInviteOptIn: null });
    const result = await getInvitePrompt(1);
    expect(result).not.toBeNull();
    expect(result).toContain("calendar invite");
    expect(result).toContain("email");
  });

  it("returns prompt asking for email when optIn is true but no email", async () => {
    mockClient({ email: null, calendarInviteOptIn: true });
    const result = await getInvitePrompt(1);
    expect(result).not.toBeNull();
    expect(result).toContain("email");
  });
});
