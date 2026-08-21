import { describe, it, expect } from "vitest";
import { runIntegrityChecks, repairState, integrityScore, FALLBACK_CATEGORY } from "./integrity";
import type { NovaState, Transaction, Account } from "./nova-store";

const acc = (id: string): Account => ({
  id,
  name: "Bank",
  number: "x",
  holder: "h",
  balance: 100,
  gradient: "",
  brand: "",
  type: "bank",
  currency: "EUR",
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t1",
  title: "Coffee",
  category: "food",
  amount: -5,
  date: new Date().toISOString(),
  accountId: "a1",
  currency: "EUR",
  ...over,
});

const base = (over: Partial<NovaState>): NovaState =>
  ({
    accounts: [acc("a1")],
    transactions: [],
    budgets: [],
    goals: [],
    liabilities: [],
    recurring: [],
    subscriptions: [],
    automationRules: [],
    categories: [{ id: "food", name: "Food", icon: "utensils", color: "" }],
    ...over,
  }) as unknown as NovaState;

describe("integrity checks", () => {
  it("reports a clean state", () => {
    const issues = runIntegrityChecks(base({ transactions: [tx({})] }));
    expect(issues).toHaveLength(0);
    expect(integrityScore(issues)).toBe(100);
  });

  it("detects and repairs orphan transactions", () => {
    const state = base({ transactions: [tx({ accountId: "gone" })] });
    const issues = runIntegrityChecks(state);
    expect(issues.map((i) => i.kind)).toContain("orphan_tx");
    const fixed = repairState(state, ["orphan_tx"]);
    expect(fixed.transactions[0].accountId).toBe("a1");
    expect(runIntegrityChecks(fixed)).toHaveLength(0);
  });

  it("drops duplicate transaction ids", () => {
    const state = base({ transactions: [tx({}), tx({})] });
    expect(runIntegrityChecks(state).some((i) => i.kind === "duplicate_tx_id")).toBe(true);
    expect(repairState(state, ["duplicate_tx_id"]).transactions).toHaveLength(1);
  });

  it("unpairs a transfer that lost its other leg", () => {
    const state = base({ transactions: [tx({ id: "t1", transferId: "tr1", category: "transfer" })] });
    expect(runIntegrityChecks(state).some((i) => i.kind === "broken_transfer")).toBe(true);
    expect(repairState(state, ["broken_transfer"]).transactions[0].transferId).toBeUndefined();
  });

  it("keeps a healthy two-leg transfer intact", () => {
    const state = base({
      accounts: [acc("a1"), acc("a2")],
      transactions: [
        tx({ id: "t1", transferId: "tr1", category: "transfer", amount: -10 }),
        tx({ id: "t2", transferId: "tr1", category: "transfer", amount: 10, accountId: "a2" }),
      ],
    });
    expect(runIntegrityChecks(state).some((i) => i.kind === "broken_transfer")).toBe(false);
  });

  it("reassigns transactions in a deleted category", () => {
    const state = base({ transactions: [tx({ category: "ghost" })] });
    expect(runIntegrityChecks(state).some((i) => i.kind === "unknown_category")).toBe(true);
    expect(repairState(state, ["unknown_category"]).transactions[0].category).toBe(FALLBACK_CATEGORY);
  });

  it("penalises critical issues harder than warnings", () => {
    const critical = base({ transactions: [tx({ accountId: "gone" })] });
    const warning = base({ transactions: [tx({ category: "ghost" })] });
    expect(integrityScore(runIntegrityChecks(critical))).toBeLessThan(
      integrityScore(runIntegrityChecks(warning)),
    );
  });

  it("never mutates the input state", () => {
    const state = base({ transactions: [tx({ accountId: "gone" })] });
    repairState(state, ["orphan_tx"]);
    expect(state.transactions[0].accountId).toBe("gone");
  });
});
