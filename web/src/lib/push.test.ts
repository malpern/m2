import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendPush, clip } from "./push";

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubEnv("PUSHOVER_TOKEN", "atoken");
  vi.stubEnv("PUSHOVER_USER_KEY", "ukey");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

function mockFetch(res: Partial<Response> & { ok: boolean; status: number }) {
  const fn = vi.fn().mockResolvedValue({ text: async () => "", ...res });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("clip", () => {
  it("leaves short text alone", () => {
    expect(clip("hello", 100)).toBe("hello");
  });

  it("marks truncation visibly rather than cutting silently", () => {
    // A silently clipped digest reads as a complete one that ends mid-sentence.
    const out = clip("x".repeat(200), 50);
    expect(out.length).toBe(50);
    expect(out).toContain("(truncated)");
  });
});

describe("sendPush", () => {
  it("posts token, user, title, message and priority", async () => {
    const fn = mockFetch({ ok: true, status: 200 });
    const r = await sendPush("Title", "Body", 1);

    expect(r).toEqual({ status: "sent" });
    const body = (fn.mock.calls[0][1] as { body: URLSearchParams }).body;
    expect(body.get("token")).toBe("atoken");
    expect(body.get("user")).toBe("ukey");
    expect(body.get("title")).toBe("Title");
    expect(body.get("message")).toBe("Body");
    expect(body.get("priority")).toBe("1");
  });

  it("defaults to priority 0", async () => {
    const fn = mockFetch({ ok: true, status: 200 });
    await sendPush("T", "B");
    const body = (fn.mock.calls[0][1] as { body: URLSearchParams }).body;
    expect(body.get("priority")).toBe("0");
  });

  it("skips — and does not throw — when unconfigured", async () => {
    // An alerting path that throws when it cannot alert turns one problem
    // into two. Callers report the reason instead.
    vi.stubEnv("PUSHOVER_TOKEN", "");
    const fn = mockFetch({ ok: true, status: 200 });

    const r = await sendPush("T", "B");
    expect(r.status).toBe("skipped");
    expect(r).toMatchObject({ reason: expect.stringContaining("PUSHOVER_TOKEN") });
    expect(fn).not.toHaveBeenCalled();
  });

  it("treats a non-2xx as a failure, never as sent", async () => {
    mockFetch({ ok: false, status: 400, text: async () => '{"errors":["user key is invalid"]}' });
    const r = await sendPush("T", "B");
    expect(r.status).toBe("skipped");
    expect(r).toMatchObject({ reason: expect.stringContaining("400") });
  });

  it("reports a network failure instead of throwing", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    const r = await sendPush("T", "B");
    expect(r).toEqual({ status: "skipped", reason: "ECONNRESET" });
  });

  it("clips an over-long message rather than letting Pushover cut it silently", async () => {
    const fn = mockFetch({ ok: true, status: 200 });
    await sendPush("T", "y".repeat(5000));
    const body = (fn.mock.calls[0][1] as { body: URLSearchParams }).body;
    expect(body.get("message")!.length).toBe(1024);
    expect(body.get("message")).toContain("(truncated)");
  });
});
