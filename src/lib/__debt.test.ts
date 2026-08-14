import { describe, it, expect } from "vitest";
import { buildPayoffPlan, isPlannable, hasAprData, interestSaving } from "@/lib/debt-payoff";

const cc = { id: "a", name: "Card", balance: 1000, apr: 24, minPayment: 100 };
const loan = { id: "b", name: "Loan", balance: 3000, apr: 6, minPayment: 100 };

describe("debt payoff", () => {
  it("one credit card amortizes", () => {
    const p = buildPayoffPlan([cc], "minimum");
    expect(p.feasible).toBe(true);
    expect(p.months).toBeGreaterThan(9);
    expect(p.totalInterest).toBeGreaterThan(0);
  });
  it("multiple debts, snowball pays smallest first", () => {
    const p = buildPayoffPlan([loan, cc], "snowball");
    expect(p.lines[0].name).toBe("Card");
    expect(p.feasible).toBe(true);
  });
  it("avalanche pays highest APR first", () => {
    const p = buildPayoffPlan([loan, cc], "avalanche");
    expect(p.lines[0].name).toBe("Card");
    expect(interestSaving(p, buildPayoffPlan([loan, cc], "snowball"))).toBeGreaterThanOrEqual(0);
  });
  it("extra payment shortens payoff", () => {
    const base = buildPayoffPlan([loan, cc], "avalanche", 0);
    const fast = buildPayoffPlan([loan, cc], "avalanche", 300);
    expect(fast.months).toBeLessThan(base.months);
    expect(fast.totalInterest).toBeLessThan(base.totalInterest);
  });
  it("APR = 0 accrues no interest", () => {
    const p = buildPayoffPlan([{ id: "z", name: "IOU", balance: 500, apr: 0, minPayment: 100 }], "minimum");
    expect(p.totalInterest).toBe(0);
    expect(p.months).toBe(5);
  });
  it("missing APR is treated as 0, not invented", () => {
    const p = buildPayoffPlan([{ id: "z", name: "IOU", balance: 500, minPayment: 100 }], "minimum");
    expect(p.totalInterest).toBe(0);
  });
  it("minimum below interest is flagged, no fake date", () => {
    const p = buildPayoffPlan([{ id: "z", name: "Trap", balance: 10000, apr: 30, minPayment: 50 }], "minimum");
    expect(p.feasible).toBe(false);
    expect(p.debtFreeDate).toBe(null);
    expect(p.stalled).toContain("Trap");
  });
  it("missing minimum payment is skipped", () => {
    const p = buildPayoffPlan([{ id: "z", name: "Mystery", balance: 900, apr: 5 }], "snowball");
    expect(p.skipped).toContain("Mystery");
    expect(p.lines.length).toBe(0);
    expect(isPlannable({ id: "z", name: "M", balance: 900 })).toBe(false);
  });
  it("zero balance and no debts", () => {
    const p = buildPayoffPlan([{ id: "z", name: "Paid", balance: 0, apr: 5, minPayment: 10 }], "snowball");
    expect(p.lines.length).toBe(0);
    expect(buildPayoffPlan([], "avalanche").feasible).toBe(false);
    expect(hasAprData([])).toBe(false);
  });
});
