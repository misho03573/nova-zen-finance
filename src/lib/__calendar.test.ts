import { describe, it, expect } from "vitest";
import {
  buildCalendar,
  rangeFor,
  shiftCursor,
  dayKey,
  safeTime,
  startOfDay,
} from "@/lib/cashflow-calendar";
import type { Account, Recurring, Subscription, Transaction } from "@/lib/nova-store";
import { convertAmount } from "@/lib/currency";

const NOW = Date.parse("2026-03-10T09:00:00");
const DAY = 86_400_000;
const iso = (offsetDays: number, hour = 9) =>
  new Date(startOfDay(NOW + offsetDays * DAY) + hour * 3_600_000).toISOString();

const accounts = [
  { id: "a1", name: "Main", type: "bank", balance: 2000, currency: "USD", number: "", gradient: "", holder: "", brand: "" },
  { id: "a2", name: "Broker", type: "trading", balance: 9000, currency: "USD", number: "", gradient: "", holder: "", brand: "" },
] as unknown as Account[];

const transactions = [
  { id: "t1", title: "Groceries", category: "food", amount: -40, date: iso(-2), accountId: "a1" },
  { id: "t2", title: "Payday", category: "income", amount: 500, date: iso(-2), accountId: "a1" },
  { id: "t3", title: "To savings", category: "transfer", amount: -300, date: iso(-2), accountId: "a1", transferId: "x1" },
  { id: "t4", title: "From main", category: "transfer", amount: 300, date: iso(-2), accountId: "a2", transferId: "x1" },
  { id: "t5", title: "Reconcile", category: "other", amount: -25, date: iso(-1), accountId: "a1", kind: "adjustment" },
] as unknown as Transaction[];

const recurring = [
  { id: "r1", title: "Salary", category: "income", amount: 3000, accountId: "a1", frequency: "monthly", nextDate: iso(5), currency: "USD" },
  { id: "r2", title: "Rent", category: "home", amount: -1200, accountId: "a1", frequency: "monthly", nextDate: iso(3), currency: "USD" },
  { id: "r3", title: "Move to savings", category: "transfer", amount: -200, accountId: "a1", frequency: "monthly", nextDate: iso(4), currency: "USD" },
] as unknown as Recurring[];

const subscriptions = [
  { id: "s1", name: "Netflix", amount: 15, category: "fun", accountId: "a1", frequency: "monthly", nextDate: iso(6), status: "active", currency: "USD", color: "", emoji: "" },
  { id: "s2", name: "Gym", amount: 30, category: "health", accountId: "a1", frequency: "monthly", nextDate: iso(8), status: "cancelled", currency: "USD", color: "", emoji: "" },
] as unknown as Subscription[];

const build = (o: Partial<Parameters<typeof buildCalendar>[0]> = {}) =>
  buildCalendar({
    view: "month",
    cursor: NOW,
    accounts,
    transactions,
    recurring,
    subscriptions,
    now: NOW,
    ...o,
  });

describe("ranges and navigation", () => {
  it("builds day, week (Monday-first) and month ranges", () => {
    const d = rangeFor("day", NOW);
    expect(d.start).toBe(d.end);
    const w = rangeFor("week", NOW);
    expect(new Date(w.start).getDay()).toBe(1);
    expect(Math.round((w.end - w.start) / DAY)).toBe(6);
    const m = rangeFor("month", NOW);
    expect(new Date(m.start).getDate()).toBe(1);
    expect(new Date(m.end).getMonth()).toBe(new Date(NOW).getMonth());
  });

  it("shifts the cursor by one view length in both directions", () => {
    expect(dayKey(shiftCursor("day", NOW, 1))).toBe(dayKey(NOW + DAY));
    expect(dayKey(shiftCursor("week", NOW, -1))).toBe(dayKey(NOW - 7 * DAY));
    expect(new Date(shiftCursor("month", NOW, 1)).getMonth()).toBe(new Date(NOW).getMonth() + 1);
  });

  it("falls back to now for invalid cursors", () => {
    expect(Number.isFinite(rangeFor("month", Number.NaN).start)).toBe(true);
    expect(Number.isFinite(shiftCursor("week", Number.POSITIVE_INFINITY, 1))).toBe(true);
  });

  it("parses only usable dates", () => {
    expect(safeTime("nope")).toBeNull();
    expect(safeTime(Number.NaN)).toBeNull();
    expect(safeTime(undefined)).toBeNull();
    expect(safeTime(iso(0))).not.toBeNull();
  });
});

describe("day grouping", () => {
  it("groups posted transactions and expected events on their own days", () => {
    const res = build();
    const posted = res.days.find((d) => d.key === dayKey(NOW - 2 * DAY))!;
    expect(posted.hasPosted).toBe(true);
    expect(posted.events.filter((e) => e.status === "posted").length).toBe(4);
    const rent = res.days.find((d) => d.key === dayKey(NOW + 3 * DAY))!;
    expect(rent.hasExpected).toBe(true);
    expect(rent.events[0]!.source).toBe("recurring");
  });

  it("never marks future recurring items as posted", () => {
    const res = build();
    for (const d of res.days) {
      for (const e of d.events) {
        if (e.status === "posted") expect(d.ts).toBeLessThanOrEqual(startOfDay(NOW));
      }
    }
  });

  it("ignores cancelled subscriptions and transfer-like recurring items", () => {
    const titles = build()
      .days.flatMap((d) => d.events)
      .map((e) => e.title);
    expect(titles).not.toContain("Gym");
    expect(titles).not.toContain("Move to savings");
  });
});

describe("balances and totals", () => {
  it("excludes transfers and adjustments from net movement", () => {
    const res = build();
    const posted = res.days.find((d) => d.key === dayKey(NOW - 2 * DAY))!;
    expect(posted.income).toBe(500);
    expect(posted.expense).toBe(40);
    expect(posted.net).toBe(460);
    const adj = res.days.find((d) => d.key === dayKey(NOW - DAY))!;
    expect(adj.net).toBe(0);
    expect(adj.events).toHaveLength(1);
  });

  it("starts the running balance at liquid cash only", () => {
    const res = build();
    expect(res.startBalance).toBe(2000); // trading account excluded
  });

  it("carries the running balance forward across expected events", () => {
    const res = build();
    const before = res.days.find((d) => d.key === dayKey(NOW))!;
    expect(before.balance).toBe(2000);
    const afterRent = res.days.find((d) => d.key === dayKey(NOW + 3 * DAY))!;
    expect(afterRent.balance).toBe(800);
    const afterSalary = res.days.find((d) => d.key === dayKey(NOW + 5 * DAY))!;
    expect(afterSalary.balance).toBe(3800);
    expect(res.lowestBalance).toBe(800);
    expect(res.lowestDateKey).toBe(dayKey(NOW + 3 * DAY));
  });

  it("leaves past days without a simulated balance", () => {
    const res = build();
    expect(res.days.find((d) => d.key === dayKey(NOW - 2 * DAY))!.balance).toBeNull();
  });

  it("carries expected movement into a future month view", () => {
    const next = build({ cursor: shiftCursor("month", NOW, 1) });
    expect(next.days[0]!.balance).toBeGreaterThan(0);
    expect(next.endBalance).not.toBeNull();
    expect(Number.isFinite(next.endBalance!)).toBe(true);
  });

  it("reports expected and posted totals separately", () => {
    const res = build();
    expect(res.postedIncome).toBe(500);
    expect(res.postedExpense).toBe(40);
    expect(res.expectedIncome).toBeGreaterThan(0);
    expect(res.expectedExpense).toBeGreaterThan(0);
  });
});

describe("currency", () => {
  it("scales with already-converted display amounts", () => {
    const rate = (n: number) => convertAmount(n, "USD", "EUR");
    const res = buildCalendar({
      view: "month",
      cursor: NOW,
      accounts: accounts.map((a) => ({ ...a, balance: rate(a.balance) })),
      transactions: transactions.map((t) => ({ ...t, amount: rate(t.amount) })),
      recurring: recurring.map((r) => ({ ...r, amount: rate(r.amount) })),
      subscriptions: subscriptions.map((s) => ({ ...s, amount: rate(s.amount) })),
      now: NOW,
    });
    expect(res.startBalance).toBeCloseTo(rate(2000), 6);
    const afterRent = res.days.find((d) => d.key === dayKey(NOW + 3 * DAY))!;
    expect(afterRent.balance).toBeCloseTo(rate(800), 6);
  });
});

describe("invalid data", () => {
  it("survives malformed records without NaN or Infinity", () => {
    const res = buildCalendar({
      view: "month",
      cursor: NOW,
      accounts: [{ id: "a1", type: "cash", balance: Number.NaN } as unknown as Account],
      transactions: [
        null,
        undefined,
        { id: "b1", amount: Number.NaN, date: iso(-1), accountId: "a1" },
        { id: "b2", amount: 10, date: "not-a-date", accountId: "a1" },
        { id: "b3", amount: Number.POSITIVE_INFINITY, date: iso(-1), accountId: "a1" },
      ] as unknown as Transaction[],
      recurring: [
        { id: "r", title: "x", amount: Number.NaN, nextDate: iso(2), frequency: "monthly", accountId: "a1" },
        { id: "r2", title: "y", amount: -10, nextDate: "bad", frequency: "monthly", accountId: "a1" },
      ] as unknown as Recurring[],
      subscriptions: [{ id: "s", name: "z", amount: Number.NaN, nextDate: iso(1), status: "active" }] as unknown as Subscription[],
      now: NOW,
    });
    for (const d of res.days) {
      expect(Number.isFinite(d.income)).toBe(true);
      expect(Number.isFinite(d.expense)).toBe(true);
      expect(Number.isFinite(d.net)).toBe(true);
      if (d.balance !== null) expect(Number.isFinite(d.balance)).toBe(true);
    }
    expect(Number.isFinite(res.startBalance)).toBe(true);
  });

  it("tolerates missing arrays and an invalid now", () => {
    const res = buildCalendar({
      view: "week",
      cursor: NOW,
      accounts: undefined as unknown as Account[],
      transactions: undefined as unknown as Transaction[],
      recurring: undefined as unknown as Recurring[],
      subscriptions: undefined as unknown as Subscription[],
      now: Number.NaN,
    });
    expect(res.days).toHaveLength(7);
    expect(res.startBalance).toBe(0);
  });
});

describe("read-only invariants", () => {
  it("never mutates the inputs it is given", () => {
    const snapshot = JSON.stringify({ accounts, transactions, recurring, subscriptions });
    build();
    build({ view: "day" });
    build({ view: "week" });
    expect(JSON.stringify({ accounts, transactions, recurring, subscriptions })).toBe(snapshot);
  });

  it("returns plain data with no callable actions", () => {
    const res = build();
    for (const value of Object.values(res)) expect(typeof value).not.toBe("function");
    for (const e of res.days.flatMap((d) => d.events)) {
      expect(["posted", "expected"]).toContain(e.status);
      expect(Number.isFinite(e.amount)).toBe(true);
    }
  });
});
