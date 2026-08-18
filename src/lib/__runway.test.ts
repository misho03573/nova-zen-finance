import { describe, it, expect } from "vitest";
import { computeRunway, liquidFunds } from "./runway";
import type { Account, Transaction } from "./nova-store";

const NOW = new Date(2026, 7, 15); // 15 Aug 2026 → completed months: Jul, Jun, May
const acc = (o: Partial<Account> = {}): Account => ({
  id: "a1", name: "Bank", number: "", holder: "", balance: 4200,
  gradient: "", brand: "", type: "bank", ...o,
});
const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2), title: "x", category: "food",
  amount: -100, date: new Date(2026, 6, 10).toISOString(), accountId: "a1", ...o,
});
const base = { essentialCategories: ["rent"], targetMonths: 3, now: NOW };

describe("runway", () => {
  it("counts only liquid accounts", () => {
    expect(
      liquidFunds([acc(), acc({ id: "a2", type: "cash", balance: 300 }),
        acc({ id: "a3", type: "trading", balance: 9999 }),
        acc({ id: "a4", type: "crypto", balance: 5000 })]),
    ).toBe(4500);
  });

  it("averages 3 completed months and excludes income/transfers/adjustments", () => {
    const txs = [
      tx({ amount: -300, date: new Date(2026, 6, 5).toISOString() }),
      tx({ amount: -300, date: new Date(2026, 5, 5).toISOString() }),
      tx({ amount: -300, date: new Date(2026, 4, 5).toISOString() }),
      tx({ amount: 5000, category: "salary", date: new Date(2026, 6, 1).toISOString() }),
      tx({ amount: -500, transferId: "t1", date: new Date(2026, 6, 2).toISOString() }),
      tx({ amount: -650, kind: "adjustment", date: new Date(2026, 6, 3).toISOString() }),
      tx({ amount: -999, date: new Date(2026, 7, 3).toISOString() }), // current month ignored
    ];
    const r = computeRunway({ accounts: [acc()], transactions: txs, ...base });
    expect(r.monthsUsed).toBe(3);
    expect(r.avgMonthly).toBe(300);
    expect(r.limitedHistory).toBe(false);
    expect(r.totalRunway).toBeCloseTo(14);
  });

  it("flags limited history", () => {
    const r = computeRunway({
      accounts: [acc({ balance: 1000 })],
      transactions: [tx({ amount: -500, date: new Date(2026, 6, 4).toISOString() })],
      ...base,
    });
    expect(r.monthsUsed).toBe(1);
    expect(r.limitedHistory).toBe(true);
    expect(r.totalRunway).toBe(2);
  });

  it("computes essential runway and target from custom categories", () => {
    const txs = [
      tx({ amount: -700, category: "myrent", date: new Date(2026, 6, 4).toISOString() }),
      tx({ amount: -700, category: "food", date: new Date(2026, 6, 5).toISOString() }),
    ];
    const r = computeRunway({
      accounts: [acc({ balance: 4200 })], transactions: txs,
      essentialCategories: ["myrent"], targetMonths: 6, now: NOW,
    });
    expect(r.avgEssential).toBe(700);
    expect(r.essentialRunway).toBe(6);
    expect(r.target).toBe(4200);
    expect(r.remaining).toBe(0);
    expect(r.progress).toBe(1);
    expect(r.state).toBe("strong");
  });

  it("returns no-data state without history", () => {
    const r = computeRunway({ accounts: [acc()], transactions: [], ...base });
    expect(r.monthsUsed).toBe(0);
    expect(r.totalRunway).toBeNull();
    expect(r.target).toBeNull();
    expect(r.state).toBe("none");
  });

  it("marks critical when liquid covers under a month", () => {
    const r = computeRunway({
      accounts: [acc({ balance: 200 })],
      transactions: [tx({ amount: -800, category: "rent", date: new Date(2026, 6, 4).toISOString() })],
      ...base,
    });
    expect(r.state).toBe("critical");
  });
});
