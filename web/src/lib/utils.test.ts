import { describe, it, expect } from "vitest";
import { formatSecondsAgo } from "./utils";

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

describe("formatPhoneNumber", () => {
  it("formats +1 international number", () => {
    expect(formatPhoneNumber("+14083900506")).toBe("(408) 390-0506");
  });

  it("formats 10-digit number", () => {
    expect(formatPhoneNumber("4083900506")).toBe("(408) 390-0506");
  });

  it("passes through short numbers unchanged", () => {
    expect(formatPhoneNumber("911")).toBe("911");
  });

  it("handles dashes and spaces", () => {
    expect(formatPhoneNumber("408-390-0506")).toBe("(408) 390-0506");
  });
});

describe("formatSecondsAgo", () => {
  it("returns 'just now' for less than 5 seconds", () => {
    expect(formatSecondsAgo(0)).toBe("just now");
    expect(formatSecondsAgo(4)).toBe("just now");
  });

  it("returns seconds for 5-59 seconds", () => {
    expect(formatSecondsAgo(5)).toBe("5s ago");
    expect(formatSecondsAgo(30)).toBe("30s ago");
    expect(formatSecondsAgo(59)).toBe("59s ago");
  });

  it("returns minutes for 60+ seconds", () => {
    expect(formatSecondsAgo(60)).toBe("1m ago");
    expect(formatSecondsAgo(90)).toBe("1m ago");
    expect(formatSecondsAgo(120)).toBe("2m ago");
    expect(formatSecondsAgo(300)).toBe("5m ago");
  });
});
