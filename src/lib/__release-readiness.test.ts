import { describe, expect, it } from "vitest";
import { parseContribution, parseGoalValues } from "@/lib/goal-validation";
import { sanitizePersistedState } from "@/lib/persisted-state";

describe("release-readiness guards", () => {
  it("repairs malformed optional collections without discarding core data", () => {
    const safe = sanitizePersistedState<Record<string, unknown>>({ accounts: [], transactions: [], goals: "broken", settings: null });
    expect(safe?.goals).toEqual([]);
    expect(safe?.settings).toEqual({});
  });

  it("rejects documents without valid core collections", () => {
    expect(sanitizePersistedState({ accounts: {}, transactions: [] })).toBeNull();
    expect(sanitizePersistedState("broken")).toBeNull();
  });

  it("accepts only finite, non-negative goal values with a positive target", () => {
    expect(parseGoalValues("1000", "50", "25")).toEqual({ target: 1000, saved: 50, monthly: 25 });
    expect(parseGoalValues("0", "50", "25")).toBeNull();
    expect(parseGoalValues("1000", "-1", "25")).toBeNull();
    expect(parseGoalValues("Infinity", "0", "0")).toBeNull();
  });

  it("rejects zero and non-finite contributions while preserving withdrawals", () => {
    expect(parseContribution("25.5")).toBe(25.5);
    expect(parseContribution("-10")).toBe(-10);
    expect(parseContribution("0")).toBeNull();
    expect(parseContribution("NaN")).toBeNull();
  });
});