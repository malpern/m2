import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis — must use a real class so `new google.auth.OAuth2(...)` works
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

const capturedArgs: unknown[][] = [];
class MockOAuth2 {
  setCredentials = mockSetCredentials;
  refreshAccessToken = mockRefreshAccessToken;
  constructor(...args: unknown[]) {
    capturedArgs.push(args);
  }
}

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

// Mock drizzle db
const mockGet = vi.fn();
const mockRun = vi.fn();
const mockWhere = vi.fn(() => ({ run: mockRun }));
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdateFn = vi.fn(() => ({ set: mockSet }));
const mockFrom = vi.fn(() => ({ get: mockGet }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdateFn,
  },
}));

vi.mock("@/db/schema", () => ({
  googleTokens: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

describe("getOAuth2Client", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    capturedArgs.length = 0;
  });

  it("creates OAuth2 client with correct credentials", async () => {
    const { getOAuth2Client } = await import("./google-auth");
    getOAuth2Client();

    expect(capturedArgs[capturedArgs.length - 1]).toEqual([
      "test-client-id",
      "test-client-secret",
      "https://example.com/api/auth/callback",
    ]);
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const { getOAuth2Client } = await import("./google-auth");
    getOAuth2Client();

    expect(capturedArgs[capturedArgs.length - 1]).toEqual([
      "test-client-id",
      "test-client-secret",
      "http://localhost:3000/api/auth/callback",
    ]);
  });
});

describe("getAuthenticatedClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    mockGet.mockReset();
    mockSetCredentials.mockReset();
    mockRefreshAccessToken.mockReset();
    mockRun.mockReset();
    capturedArgs.length = 0;
  });

  it("returns null when no Google tokens are stored in DB", async () => {
    mockGet.mockReturnValue(undefined);

    const { getAuthenticatedClient } = await import("./google-auth");
    const result = await getAuthenticatedClient();

    expect(result).toBeNull();
  });

  it("returns OAuth2 client when tokens are valid (not expired)", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    mockGet.mockReturnValue({
      id: 1,
      accessToken: "valid-access-token",
      refreshToken: "valid-refresh-token",
      expiresAt: futureDate,
      email: "test@example.com",
    });

    const { getAuthenticatedClient } = await import("./google-auth");
    const result = await getAuthenticatedClient();

    expect(result).toBeInstanceOf(MockOAuth2);
    expect(mockSetCredentials).toHaveBeenCalledWith({
      access_token: "valid-access-token",
      refresh_token: "valid-refresh-token",
      expiry_date: new Date(futureDate).getTime(),
    });
    // Should NOT attempt refresh since token is not expired
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes expired tokens and persists them to DB", async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    mockGet.mockReturnValue({
      id: 1,
      accessToken: "expired-access-token",
      refreshToken: "valid-refresh-token",
      expiresAt: pastDate,
      email: "test@example.com",
    });

    const newExpiry = Date.now() + 7200000;
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: newExpiry,
      },
    });

    const { getAuthenticatedClient } = await import("./google-auth");
    const result = await getAuthenticatedClient();

    expect(result).toBeInstanceOf(MockOAuth2);
    expect(mockRefreshAccessToken).toHaveBeenCalled();
    // Verify DB update was called (persisted refreshed tokens)
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access-token",
      })
    );
    // Verify credentials were set with new tokens
    expect(mockSetCredentials).toHaveBeenCalledTimes(2);
  });

  it("returns null when token refresh fails", async () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    mockGet.mockReturnValue({
      id: 1,
      accessToken: "expired-access-token",
      refreshToken: "bad-refresh-token",
      expiresAt: pastDate,
      email: "test@example.com",
    });

    mockRefreshAccessToken.mockRejectedValue(new Error("invalid_grant"));

    const { getAuthenticatedClient } = await import("./google-auth");
    const result = await getAuthenticatedClient();

    expect(result).toBeNull();
  });
});

describe("getAuthenticatedClientWithEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    mockGet.mockReset();
    mockSetCredentials.mockReset();
    mockRefreshAccessToken.mockReset();
  });

  it("returns both oauth2 client and email when tokens exist", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    mockGet.mockReturnValue({
      id: 1,
      accessToken: "valid-access-token",
      refreshToken: "valid-refresh-token",
      expiresAt: futureDate,
      email: "user@example.com",
    });

    const { getAuthenticatedClientWithEmail } = await import("./google-auth");
    const result = await getAuthenticatedClientWithEmail();

    expect(result).not.toBeNull();
    expect(result!.oauth2).toBeInstanceOf(MockOAuth2);
    expect(result!.email).toBe("user@example.com");
  });

  it("returns null when no tokens are stored", async () => {
    mockGet.mockReturnValue(undefined);

    const { getAuthenticatedClientWithEmail } = await import("./google-auth");
    const result = await getAuthenticatedClientWithEmail();

    expect(result).toBeNull();
  });
});
