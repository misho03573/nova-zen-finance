import { describe, it, expect } from "vitest";
import { reducer, emptyState, type NovaState, type Goal, type Account } from "./nova-store";

const acc = (id: string, balance: number, currency = "EUR"): Account =>
  ({ id, name: id, balance, currency, type: "bank" }) as Account;

const goal = (o: Partial<Goal> = {}): Goal =>
  ({ id: "g1", name: "Trip", emoji: "✈️", target: 1000, saved: 0, currency: "EUR", ...o }) as Goal;

const base = (o: Partial<NovaState> = {}): NovaState => ({ ...emptyState, ...o });

const netWorth = (s: NovaState) => s.accounts.reduce((t, a) => t + a.balance, 0);

describe("goal contributions keep money in Net Worth", () => {
  it("linked goal moves money between accounts without changing Net Worth", () => {
    const s0 = base({ accounts: [acc("a1", 1000), acc("a2", 0)], goals: [goal({ accountId: "a2" })] });
    const s1 = reducer(s0, { type: "contributeGoal", id: "g1", amount: 200, currency: "EUR", accountId: "a1" });
    expect(netWorth(s1)).toBe(netWorth(s0));
    expect(s1.accounts.find((a) => a.id === "a1")!.balance).toBe(800);
    expect(s1.accounts.find((a) => a.id === "a2")!.balance).toBe(200);
    expect(s1.goals[0].saved).toBe(200);
    expect(s1.transactions).toHaveLength(2);
    expect(new Set(s1.transactions.map((t) => t.transferId)).size).toBe(1);
  });

  it("unlinked goal is a pure earmark: no transaction, no balance change", () => {
    const s0 = base({ accounts: [acc("a1", 1000)], goals: [goal()] });
    const s1 = reducer(s0, { type: "contributeGoal", id: "g1", amount: 200, currency: "EUR", accountId: "a1" });
    expect(netWorth(s1)).toBe(1000);
    expect(s1.transactions).toHaveLength(0);
    expect(s1.goals[0].saved).toBe(200);
  });

  it("never lets a goal go negative", () => {
    const s0 = base({ accounts: [acc("a1", 1000), acc("a2", 50)], goals: [goal({ saved: 50, accountId: "a2" })] });
    const s1 = reducer(s0, { type: "contributeGoal", id: "g1", amount: -500, currency: "EUR", accountId: "a1" });
    expect(s1.goals[0].saved).toBe(0);
    expect(netWorth(s1)).toBe(netWorth(s0));
  });

  it("deleting a contribution refunds the goal exactly once", () => {
    const s0 = base({ accounts: [acc("a1", 1000), acc("a2", 0)], goals: [goal({ accountId: "a2" })] });
    const s1 = reducer(s0, { type: "contributeGoal", id: "g1", amount: 200, currency: "EUR", accountId: "a1" });
    const s2 = reducer(s1, { type: "deleteTransaction", id: s1.transactions[0].id });
    expect(s2.transactions).toHaveLength(0);
    expect(s2.goals[0].saved).toBe(0);
    expect(netWorth(s2)).toBe(netWorth(s0));
  });
});

describe("goal deletion keeps automation rules valid", () => {
  const withRules = () =>
    base({
      goals: [goal(), goal({ id: "g2", name: "Car" })],
      automationRules: [
        { id: "ar1", kind: "roundup", enabled: true, label: "Round up", goalId: "g1" },
        { id: "ar2", kind: "roundup", enabled: true, label: "Other", goalId: "g2" },
      ],
    });

  it("disables and unlinks rules that funded the deleted goal", () => {
    const s = reducer(withRules(), { type: "deleteGoal", id: "g1" });
    const r = s.automationRules.find((x) => x.id === "ar1")!;
    expect(r.goalId).toBeUndefined();
    expect(r.enabled).toBe(false);
    expect(s.automationRules.find((x) => x.id === "ar2")!.goalId).toBe("g2");
  });

  it("reassigns rules when a replacement goal is given", () => {
    const s = reducer(withRules(), { type: "deleteGoal", id: "g1", reassignTo: "g2" });
    const r = s.automationRules.find((x) => x.id === "ar1")!;
    expect(r.goalId).toBe("g2");
    expect(r.enabled).toBe(true);
  });
});

describe("account deletion unlinks goals", () => {
  it("clears the link when an empty linked account is removed", () => {
    const s0 = base({ accounts: [acc("a1", 0)], goals: [goal({ accountId: "a1" })] });
    const s1 = reducer(s0, { type: "deleteAccount", id: "a1" });
    expect(s1.goals[0].accountId).toBeUndefined();
  });
});
