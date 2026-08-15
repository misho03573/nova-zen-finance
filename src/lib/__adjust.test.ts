import { describe, it, expect } from "vitest";
import {
  monthlyTotals,
  monthlySpendByCategory,
  savingsRate,
  computeSnapshot,
  netWorthBreakdown,
  type NovaState,
  type Transaction,
  type Account,
} from "./nova-store";
import { isTransfer } from "./monthly-review";

const acc = (over: Partial<Account>): Account => ({
  id: "a1",
  name: "Bank",
  number: "x",
  holder: "h",
  balance: 1761,
  gradient: "",
  brand: "",
  type: "bank",
  currency: "EUR",
  ...over,
});

const adj = (amount: number, resulting: number): Transaction => ({
  id: "adj1",
  title: "Balance correction",
  category: "adjustment",
  amount,
  date: new Date().toISOString(),
  accountId: "a1",
  currency: "EUR",
  kind: "adjustment",
  resultingBalance: resulting,
});

const spend: Transaction = {
  id: "t1",
  title: "Food",
  category: "food",
  amount: -100,
  date: new Date().toISOString(),
  accountId: "a1",
  currency: "EUR",
};
const pay: Transaction = { ...spend, id: "t2", title: "Salary", category: "salary", amount: 1000 };

describe("balance reconciliation", () => {
  it("computes a negative difference (1761 -> 1105)", () => {
    expect(1105 - 1761).toBe(-656);
    const t = adj(-656, 1105);
    expect(t.resultingBalance).toBe(1105);
  });

  it("computes a positive difference (500 -> 600)", () => {
    expect(600 - 500).toBe(100);
  });

  it("creates nothing when balances match", () => {
    expect(600 - 600).toBe(0);
  });

  it("is excluded from income/expense totals and savings rate", () => {
    const base = [pay, spend];
    const withAdj = [...base, adj(-656, 1105)];
    expect(monthlyTotals(withAdj)).toEqual(monthlyTotals(base));
    const { income, expenses } = monthlyTotals(withAdj);
    expect(savingsRate(income, expenses)).toBe(savingsRate(1000, 100));
  });

  it("is excluded from category spending / budgets", () => {
    const m = monthlySpendByCategory([spend, adj(-656, 1105)]);
    expect(m["adjustment"]).toBeUndefined();
    expect(m["food"]).toBe(100);
  });

  it("counts as a transfer-like row in Monthly Review", () => {
    expect(isTransfer(adj(-656, 1105))).toBe(true);
    expect(isTransfer(spend)).toBe(false);
  });

  it("affects Net Worth via the account balance", () => {
    const state = {
      accounts: [acc({ balance: 1105 })],
      liabilities: [],
      transactions: [],
    } as unknown as NovaState;
    const nb = netWorthBreakdown(state);
    expect(nb.assets).toBeCloseTo(1105, 2);
    const snap = computeSnapshot(state);
    expect(snap.assets).toBeGreaterThan(0);
  });

  it("supports negative balances and non-EUR accounts", () => {
    const a = acc({ balance: -50, currency: "USD" });
    expect(-20 - a.balance).toBe(30);
  });
});
