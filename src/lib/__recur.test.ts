import { describe, it, expect } from "vitest";
import { detectRecurring } from "./recur-detect";
import type { Transaction } from "./nova-store";

const NOW = +new Date(2026, 7, 20);
let i = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${i++}`, title: "Netflix", category: "subscription",
  amount: -15.99, date: new Date(2026, 4, 12).toISOString(), accountId: "a1",
  currency: "EUR", ...o,
});
const at = (m: number, d: number, o: Partial<Transaction> = {}) =>
  tx({ date: new Date(2026, m, d).toISOString(), ...o });
const run = (transactions: Transaction[], extra = {}) =>
  detectRecurring({ transactions, now: NOW, ...extra });

describe("recurring detection", () => {
  it("detects four monthly Netflix payments", () => {
    const r = run([at(4, 12), at(5, 12), at(6, 12), at(7, 12)]);
    expect(r).toHaveLength(1);
    expect(r[0].frequency).toBe("monthly");
    expect(r[0].count).toBe(4);
    expect(r[0].amount).toBe(15.99);
    expect(r[0].currency).toBe("EUR");
    expect(r[0].level).toBe("high");
    expect(new Date(r[0].nextDate).getTime()).toBeGreaterThan(NOW);
  });

  it("tolerates a 1-3 day billing shift", () => {
    const r = run([at(4, 12), at(5, 14), at(6, 13), at(7, 12)]);
    expect(r).toHaveLength(1);
    expect(r[0].frequency).toBe("monthly");
  });

  it("tolerates a small price increase", () => {
    const r = run([
      at(4, 12, { amount: -14.99 }), at(5, 12, { amount: -14.99 }),
      at(6, 12, { amount: -15.49 }), at(7, 12, { amount: -15.49 }),
    ]);
    expect(r).toHaveLength(1);
  });

  it("detects weekly and quarterly patterns", () => {
    const w = run([at(7, 1, { title: "Gym" }), at(7, 8, { title: "Gym" }), at(7, 15, { title: "Gym" })]);
    expect(w[0].frequency).toBe("weekly");
    const q = run([at(1, 5, { title: "Insurance" }), at(4, 6, { title: "Insurance" }), at(7, 5, { title: "Insurance" })]);
    expect(q[0].frequency).toBe("quarterly");
  });

  it("skips patterns already covered by a subscription or recurring item", () => {
    const txs = [at(4, 12), at(5, 12), at(6, 12), at(7, 12)];
    expect(run(txs, {
      subscriptions: [{ id: "s1", name: "Netflix", amount: 15.99, category: "subscription", nextDate: "", color: "", emoji: "" }],
    })).toHaveLength(0);
    expect(run(txs, {
      recurring: [{ id: "r1", title: "Netflix", category: "subscription", amount: -15.99, accountId: "a1", frequency: "monthly", nextDate: "" }],
    })).toHaveLength(0);
  });

  it("ignores transfers, adjustments and income", () => {
    expect(run([at(4, 12, { transferId: "x" }), at(5, 12, { transferId: "x" }), at(6, 12, { transferId: "x" })])).toHaveLength(0);
    expect(run([at(4, 12, { kind: "adjustment" }), at(5, 12, { kind: "adjustment" }), at(6, 12, { kind: "adjustment" })])).toHaveLength(0);
    expect(run([at(4, 12, { title: "Salary", amount: 3000 }), at(5, 12, { title: "Salary", amount: 3000 }), at(6, 12, { title: "Salary", amount: 3000 })])).toHaveLength(0);
    expect(run([at(4, 12, { category: "transfer" }), at(5, 12, { category: "transfer" }), at(6, 12, { category: "transfer" })])).toHaveLength(0);
  });

  it("does not merge different currencies", () => {
    const r = run([
      at(4, 12), at(5, 12), at(6, 12),
      at(4, 12, { currency: "USD" }), at(5, 12, { currency: "USD" }), at(6, 12, { currency: "USD" }),
    ]);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.currency))).toEqual(new Set(["EUR", "USD"]));
  });

  it("keeps ignored patterns hidden", () => {
    const txs = [at(4, 12), at(5, 12), at(6, 12), at(7, 12)];
    const key = run(txs)[0].key;
    expect(run(txs, { ignored: [key] })).toHaveLength(0);
  });

  it("requires enough history", () => {
    expect(run([at(6, 12), at(7, 12)])).toHaveLength(0);
    expect(run([at(1, 3), at(4, 20), at(7, 2)])).toHaveLength(0);
  });
});
