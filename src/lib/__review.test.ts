import { describe, expect, it } from "vitest";
import { computeMonthlyReview, monthKey } from "@/lib/monthly-review";
import type { Transaction } from "@/lib/nova-store";

const M = monthKey(new Date());
const d = (day: number) => new Date(new Date().getFullYear(), new Date().getMonth(), day).toISOString();
const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), title: "x", category: "food", amount: -10,
  date: d(5), accountId: "a1", ...o,
});
const base = { month: M, budgets: [], goals: [], subscriptions: [], history: [], to: "USD" as const };

describe("monthly review", () => {
  it("income/expenses", () => {
    const r = computeMonthlyReview({ ...base, transactions: [tx({ amount: 1000, category: "salary" }), tx({ amount: -250 })] });
    expect(r.income).toBe(1000);
    expect(r.expenses).toBe(250);
    expect(r.savingsRate).toBeCloseTo(75);
    expect(r.topCategory?.category).toBe("food");
    expect(r.largestExpense?.amount).toBe(-250);
  });
  it("excludes transfers", () => {
    const r = computeMonthlyReview({ ...base, transactions: [tx({ amount: -500, transferId: "t1" }), tx({ amount: 500, transferId: "t1" })] });
    expect(r.income).toBe(0);
    expect(r.expenses).toBe(0);
    expect(r.transferCount).toBe(2);
  });
  it("budgets over/under", () => {
    const r = computeMonthlyReview({ ...base, transactions: [tx({ amount: -300 })],
      budgets: [{ id: "b1", category: "food", limit: 100 }, { id: "b2", category: "coffee", limit: 50 }] });
    expect(r.budgetsOver).toBe(1);
    expect(r.budgetsUnder).toBe(1);
  });
  it("subscriptions dedupe against transactions", () => {
    const subs = [{ id: "s1", name: "Netflix", amount: 15, category: "entertainment", nextDate: d(9), color: "#fff", emoji: "🎬", frequency: "monthly" as const, status: "active" as const }];
    const r1 = computeMonthlyReview({ ...base, transactions: [], subscriptions: subs });
    expect(r1.subscriptionTotal).toBe(15);
    const r2 = computeMonthlyReview({ ...base, transactions: [tx({ title: "Netflix", amount: -15 })], subscriptions: subs });
    expect(r2.subscriptionTotal).toBe(0);
    expect(r2.subscriptionsMatched).toBe(1);
  });
  it("net worth unavailable without history", () => {
    expect(computeMonthlyReview({ ...base, transactions: [] }).netWorthChange).toBeNull();
  });
  it("net worth from snapshots", () => {
    const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 20);
    const pk = `${prev.getFullYear()}-${`${prev.getMonth() + 1}`.padStart(2, "0")}-20`;
    const r = computeMonthlyReview({ ...base, transactions: [],
      history: [
        { date: pk, assets: 100, liabilities: 0, net: 100, base: "USD" },
        { date: `${M}-05`, assets: 150, liabilities: 0, net: 150, base: "USD" },
      ] });
    expect(r.netWorthChange).toBe(50);
  });
  it("empty user", () => {
    const r = computeMonthlyReview({ ...base, transactions: [] });
    expect(r.income).toBe(0); expect(r.savingsRate).toBeNull(); expect(r.topCategory).toBeNull();
  });
});
