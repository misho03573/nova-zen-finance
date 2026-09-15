/**
 * Adversarial financial-integrity regression tests.
 *
 * Each case here reproduced a real defect before its fix:
 *  - reversing a goal contribution left the goal overstated (transfer-id parse)
 *  - non-finite amounts permanently poisoned account balances and Net Worth
 *  - a single broken import row poisoned the whole account
 */
import { describe, it, expect } from "vitest";
import {
  reducer,
  emptyState,
  totalLiabilities,
  type Account,
  type Goal,
  type NovaState,
} from "./nova-store";

const acc = (id: string, balance = 1000): Account => ({
  id,
  name: id,
  number: "0000",
  holder: "h",
  balance,
  gradient: "",
  brand: "",
  type: "bank",
  currency: "EUR",
});

const goal = (id: string, over: Partial<Goal> = {}): Goal => ({
  id,
  name: "Trip",
  saved: 0,
  target: 1000,
  emoji: "*",
  eta: "",
  currency: "EUR",
  ...over,
});

const base = (over: Partial<NovaState>): NovaState => ({ ...emptyState, ...over });

const assets = (s: NovaState) => s.accounts.reduce((x, a) => x + a.balance, 0);
const netWorth = (s: NovaState) => assets(s) - totalLiabilities(s.liabilities);

describe("goal contribution reversal", () => {
  // Goal ids contain underscores, which used to break transfer-id parsing.
  const goalId = "g_1757000000000_ab12x";

  const contributed = () => {
    const start = base({
      accounts: [acc("a1", 1000), acc("a2", 0)],
      goals: [goal(goalId, { accountId: "a2" })],
    });
    return reducer(start, {
      type: "contributeGoal",
      id: goalId,
      amount: 200,
      currency: "EUR",
      accountId: "a1",
    } as never);
  };

  it("keeps net worth flat and both legs paired", () => {
    const s = contributed();
    expect(netWorth(s)).toBe(1000);
    expect(s.goals[0].saved).toBe(200);
    expect(s.transactions).toHaveLength(2);
    expect(new Set(s.transactions.map((t) => t.transferId)).size).toBe(1);
  });

  it("gives the money back to the goal when a leg is deleted", () => {
    const s = contributed();
    const after = reducer(s, { type: "deleteTransaction", id: s.transactions[0].id } as never);
    expect(after.transactions).toHaveLength(0);
    expect(after.goals[0].saved).toBe(0);
    expect(netWorth(after)).toBe(1000);
    expect(after.accounts.find((a) => a.id === "a1")!.balance).toBe(1000);
  });

  it("does not touch an unrelated goal with a similar id", () => {
    const other = goal("g_1757000000000_zz99y", { saved: 500 });
    const s = reducer(base({ ...contributed(), goals: [...contributed().goals, other] }), {
      type: "deleteTransaction",
      id: contributed().transactions[0].id,
    } as never);
    expect(s.goals.find((g) => g.id === other.id)!.saved).toBe(500);
  });
});

describe("non-finite money is rejected, never stored", () => {
  const start = base({ accounts: [acc("a1", 1000), acc("a2", 0)] });

  const tx = (amount: number) => ({
    id: "t1",
    title: "x",
    category: "food",
    amount,
    date: new Date().toISOString(),
    accountId: "a1",
    currency: "EUR" as const,
  });

  for (const bad of [NaN, Infinity, -Infinity]) {
    it(`ignores an added transaction of ${bad}`, () => {
      const s = reducer(start, { type: "addTransaction", tx: tx(bad) } as never);
      expect(s).toBe(start);
      expect(Number.isFinite(netWorth(s))).toBe(true);
    });

    it(`ignores a transfer of ${bad}`, () => {
      const s = reducer(start, {
        type: "transfer",
        fromId: "a1",
        toId: "a2",
        amount: bad,
        date: new Date().toISOString(),
      } as never);
      expect(s.accounts.every((a) => Number.isFinite(a.balance))).toBe(true);
      expect(netWorth(s)).toBe(1000);
    });

    it(`ignores a balance adjustment to ${bad}`, () => {
      const s = reducer(start, {
        type: "adjustBalance",
        id: "adj1",
        accountId: "a1",
        actual: bad,
        date: new Date().toISOString(),
      } as never);
      expect(s).toBe(start);
    });

    it(`ignores a liability of ${bad}`, () => {
      const s = reducer(start, {
        type: "addLiability",
        l: { id: "l1", name: "Loan", type: "loan", balance: bad, currency: "EUR" },
      } as never);
      expect(s.liabilities).toHaveLength(0);
      expect(netWorth(s)).toBe(1000);
    });
  }

  it("ignores a non-finite budget limit", () => {
    const s = reducer(start, { type: "setBudget", category: "food", limit: NaN } as never);
    expect(s.budgets).toHaveLength(0);
  });

  it("skips only the broken rows of an import", () => {
    const s = reducer(start, {
      type: "importTransactions",
      txs: [tx(-100), { ...tx(NaN), id: "t2" }, { ...tx(-50), id: "t3" }],
    } as never);
    expect(s.transactions).toHaveLength(2);
    expect(s.accounts.find((a) => a.id === "a1")!.balance).toBe(850);
  });

  it("ignores a non-finite account edit", () => {
    const s = reducer(start, {
      type: "updateAccount",
      account: { ...acc("a1"), balance: Infinity },
    } as never);
    expect(s.accounts.find((a) => a.id === "a1")!.balance).toBe(1000);
  });
});
