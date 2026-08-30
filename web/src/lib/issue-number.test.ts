import { describe, it, expect } from "vitest";
import { isValidIssueNumber } from "./issue-number";

describe("isValidIssueNumber", () => {
  it("accepts a real issue number", () => {
    expect(isValidIssueNumber(1)).toBe(true);
    expect(isValidIssueNumber(248)).toBe(true);
  });

  it("rejects the path-injection payloads the type would have allowed", () => {
    // The whole point: a server action's `number` parameter is erased at
    // runtime, so these are what can actually turn up and get interpolated
    // into an authenticated GitHub API path.
    for (const v of ["1", "1/../../../user", "../../orgs", "1?state=open", "-1"]) {
      expect(isValidIssueNumber(v), String(v)).toBe(false);
    }
  });

  it("rejects zero and negatives — there is no issue 0", () => {
    expect(isValidIssueNumber(0)).toBe(false);
    expect(isValidIssueNumber(-5)).toBe(false);
  });

  it("rejects non-integers and unsafe integers", () => {
    expect(isValidIssueNumber(1.5)).toBe(false);
    expect(isValidIssueNumber(NaN)).toBe(false);
    expect(isValidIssueNumber(Infinity)).toBe(false);
    expect(isValidIssueNumber(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it("rejects nullish and object values", () => {
    for (const v of [null, undefined, {}, [], [1]]) {
      expect(isValidIssueNumber(v), JSON.stringify(v)).toBe(false);
    }
  });
});
