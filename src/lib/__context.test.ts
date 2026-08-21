import { describe, it, expect } from "vitest";
import { buildFinancialContext } from "@/lib/financial-context";
import { buildIntelligence } from "@/lib/intelligence";
import { buildNotifications, unreadCount } from "@/lib/notifications";
import type { Account, Transaction, Budget, Goal, Liability, Subscription } from "@/lib/nova-store";

const NOW = Date.parse("2026-08-15T12:00:00.000Z");
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString();

const acc = (over: Partial<Account> = {}): Account => ({
  id: "a1",
  name: "Main",
  type: "bank",
  balance: 1000,
  gradient: "",
  currency: "USD",
  ...(over as Account),
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  title: "Item",
  category: "food",
  amount: -10,
  date: iso(2026, 8, 5),
  accountId: "a1",
  ...over,
});

function ctxOf(over: Partial<Parameters<typeof buildFinancialContext>[0]> = {}) {
  return buildFinancialContext({
    accounts: [acc()],
    transactions: [],
    budgets: [],
    goals: [],
    liabilities: [],
    recurring: [],
    subscriptions: [],
    now: NOW,
    ...over,
  });
}

describe("financial context", () => {
  it("net worth is exactly assets minus liabilities", () => {
    const c = ctxOf({
      accounts: [acc({ balance: 2500 })],
      liabilities: [
        { id: "l1", name: "Card", type: "credit_card", balance: 400 } as Liability,
      ],
    });
    expect(c.assets).toBe(2500);
    expect(c.liabilities).toBe(400);
    expect(c.netWorth).toBe(2100);
  });

  it("excludes transfers and adjustments from income and expenses", () => {
    const c = ctxOf({
      transactions: [
        tx({ amount: -100 }),
        tx({ amount: 500, category: "salary" }),
        tx({ amount: -300, category: "transfer", transferId: "t1" }),
        tx({ amount: 300, category: "transfer", transferId: "t1" }),
        tx({ amount: -50, kind: "adjustment" }),
      ],
    });
    expect(c.income).toBe(500);
    expect(c.expenses).toBe(100);
    expect(c.savings).toBe(400);
    expect(c.savingsRate).toBe(80);
  });

  it("savings rate is null without income rather than zero", () => {
    expect(ctxOf({ transactions: [tx({ amount: -20 })] }).savingsRate).toBeNull();
  });

  it("compares category spend against the previous month", () => {
    const c = ctxOf({
      transactions: [
        tx({ amount: -200, category: "food", date: iso(2026, 8, 3) }),
        tx({ amount: -100, category: "food", date: iso(2026, 7, 3) }),
      ],
    });
    expect(c.topCategories[0]).toEqual({ category: "food", amount: 200 });
    expect(c.prevCategories.food).toBe(100);
  });

  it("groups merchant spend through the merchant engine", () => {
    const c = ctxOf({
      transactions: [
        tx({ amount: -20, title: "LIDL*0820" }),
        tx({ amount: -30, title: "LIDL 1248 SOFIA" }),
      ],
    });
    expect(c.topMerchants).toHaveLength(1);
    expect(c.topMerchants[0].amount).toBe(50);
    expect(c.topMerchants[0].count).toBe(2);
  });
});

describe("intelligence", () => {
  it("flags an over-budget category", () => {
    const c = ctxOf({
      transactions: [tx({ amount: -150, category: "food" })],
      budgets: [{ id: "b1", category: "food", limit: 100 } as Budget],
    });
    const items = buildIntelligence(c);
    const over = items.find((i) => i.id === "budget-over-b1");
    expect(over?.severity).toBe("warn");
    expect(over?.params.amount).toBe(50);
  });

  it("reports a spending spike only when both months are material", () => {
    const spike = buildIntelligence(
      ctxOf({
        transactions: [
          tx({ amount: -200, category: "food", date: iso(2026, 8, 3) }),
          tx({ amount: -100, category: "food", date: iso(2026, 7, 3) }),
        ],
      }),
    );
    expect(spike.find((i) => i.id === "cat-up-food")?.params.pct).toBe(100);

    const noise = buildIntelligence(
      ctxOf({
        transactions: [
          tx({ amount: -10, category: "food", date: iso(2026, 8, 3) }),
          tx({ amount: -2, category: "food", date: iso(2026, 7, 3) }),
        ],
      }),
    );
    expect(noise.find((i) => i.id === "cat-up-food")).toBeUndefined();
  });

  it("sorts critical findings above informational ones", () => {
    const c = ctxOf({
      accounts: [acc({ balance: 10 })],
      recurring: [
        {
          id: "r1",
          title: "Rent",
          amount: -900,
          category: "housing",
          frequency: "monthly",
          nextDate: iso(2026, 8, 20),
          accountId: "a1",
        } as never,
      ],
    });
    const items = buildIntelligence(c);
    expect(items[0].severity).toBe("critical");
  });

  it("is deterministic for the same input", () => {
    const c = ctxOf({ transactions: [tx({ amount: -150, category: "food" })] });
    expect(buildIntelligence(c)).toEqual(buildIntelligence(c));
  });
});

describe("notifications", () => {
  const busy = () =>
    ctxOf({
      transactions: [tx({ amount: -150, category: "food" })],
      budgets: [{ id: "b1", category: "food", limit: 100 } as Budget],
      goals: [{ id: "g1", name: "Trip", saved: 1000, target: 1000 } as Goal],
      subscriptions: [
        {
          id: "s1",
          name: "Netflix",
          amount: 15,
          category: "fun",
          nextDate: iso(2026, 8, 17),
          color: "",
          emoji: "",
          accountId: "a1",
          frequency: "monthly",
          status: "active",
        } as Subscription,
      ],
    });

  it("builds bill, budget and goal notifications with stable ids", () => {
    const list = buildNotifications({ ctx: busy() });
    const ids = list.map((n) => n.id);
    expect(ids).toContain("budget-over|b1|2026-08");
    expect(ids).toContain("goal-done|g1");
    expect(ids.some((i) => i.startsWith("bill|"))).toBe(true);
    expect(buildNotifications({ ctx: busy() }).map((n) => n.id)).toEqual(ids);
  });

  it("respects per-category preferences and the master switch", () => {
    expect(
      buildNotifications({ ctx: busy(), prefs: { budgets: false } }).some(
        (n) => n.category === "budgets",
      ),
    ).toBe(false);
    expect(buildNotifications({ ctx: busy(), enabled: false })).toHaveLength(0);
  });

  it("counts unread against persisted read ids", () => {
    const list = buildNotifications({ ctx: busy() });
    expect(unreadCount(list, [])).toBe(list.length);
    expect(unreadCount(list, list.map((n) => n.id))).toBe(0);
  });

  it("does not notify about bills further out than the lead window", () => {
    const far = ctxOf({
      subscriptions: [
        {
          id: "s2",
          name: "Gym",
          amount: 40,
          category: "health",
          nextDate: iso(2026, 8, 28),
          color: "",
          emoji: "",
          accountId: "a1",
          frequency: "monthly",
          status: "active",
        } as Subscription,
      ],
    });
    expect(buildNotifications({ ctx: far }).some((n) => n.category === "bills")).toBe(false);
  });
});
