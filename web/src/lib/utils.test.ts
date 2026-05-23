import { describe, it, expect } from "vitest";

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
