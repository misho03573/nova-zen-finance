import { describe, it, expect } from "vitest";
import {
  analyticsTxs,
  isTransferTx,
  monthlyTotals,
  monthlySpendByCategory,
  savingsRate,
  type Transaction,
} from "./nova-store";

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  title: "x",
  category: "food",
  amount: -100,
  date: new Date().toISOString(),
  accountId: "a1",
  currency: "EUR",
  ...o,
});

describe("transfer neutrality in analytics", () => {
  const out = tx({ amount: -500, category: "transfer", transferId: "tr1" });
  const inn = tx({ amount: 500, category: "transfer", transferId: "tr1" });

  it("detects both legs as transfers", () => {
    expect(isTransferTx(out)).toBe(true);
    expect(isTransferTx(inn)).toBe(true);
    expect(isTransferTx(tx({}))).toBe(false);
  });

  it("strips transfers before aggregation", () => {
    expect(analyticsTxs([out, inn, tx({})])).toHaveLength(1);
  });

  it("does not move income, expenses or savings rate", () => {
    const base = [tx({ amount: 1000, category: "salary" }), tx({})];
    expect(monthlyTotals([...base, out, inn])).toEqual(monthlyTotals(base));
    const { income, expenses } = monthlyTotals([...base, out, inn]);
    expect(savingsRate(income, expenses)).toBe(savingsRate(1000, 100));
  });

  it("never shows up as category spending", () => {
    const m = monthlySpendByCategory([tx({}), out]);
    expect(m["transfer"]).toBeUndefined();
    expect(m["food"]).toBe(100);
  });

  it("treats goal contributions (single tagged leg) as transfers too", () => {
    const goalLeg = tx({ amount: -200, category: "transfer", transferId: "goal_g1_123" });
    expect(analyticsTxs([goalLeg])).toHaveLength(0);
  });
});
