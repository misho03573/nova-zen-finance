import { describe, it, expect } from "vitest";
import {
  EMPTY_RAW,
  validateWhatIf,
  buildWhatIf,
  scenarioEvents,
  WHATIF_MAX_AMOUNT,
  type WhatIfRawInput,
} from "@/lib/whatif";
import { buildForecast } from "@/lib/forecast";
import type { Account, Recurring, Subscription } from "@/lib/nova-store";
import { convertAmount } from "@/lib/currency";

const NOW = Date.parse("2026-03-10T09:00:00");
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

const accounts: Account[] = [
  { id: "a1", name: "Main", type: "bank", balance: 2000, currency: "USD", number: "•• 01", gradient: "" } as unknown as Account,
  { id: "a2", name: "Savings", type: "savings", balance: 5000, currency: "USD", number: "•• 02", gradient: "" } as unknown as Account,
];
const recurring: Recurring[] = [
  { id: "r1", title: "Salary", category: "income", amount: 3000, accountId: "a1", frequency: "monthly", nextDate: iso(5), currency: "USD" } as unknown as Recurring,
  { id: "r2", title: "Rent", category: "home", amount: -1200, accountId: "a1", frequency: "monthly", nextDate: iso(2), currency: "USD" } as unknown as Recurring,
];
const subscriptions: Subscription[] = [
  { id: "s1", name: "Netflix", amount: 15, accountId: "a1", frequency: "monthly", nextDate: iso(7), status: "active", currency: "USD" } as unknown as Subscription,
];

const raw = (o: Partial<WhatIfRawInput> = {}): WhatIfRawInput => ({ ...EMPTY_RAW, ...o });
const dateStr = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

describe("validateWhatIf", () => {
  it("accepts a one-off expense with a future date", () => {
    const v = validateWhatIf(raw({ oneOffAmount: "250.50", oneOffDate: dateStr(10) }), NOW);
    expect(v.ok).toBe(true);
    expect(v.scenario.oneOff).toBe(-250.5);
    expect(v.scenario.oneOffAt).not.toBeNull();
  });

  it("signs income positively and monthly changes independently", () => {
    const v = validateWhatIf(
      raw({ oneOffAmount: "100", oneOffDirection: "income", oneOffDate: dateStr(1), monthlyAmount: "40", monthlyDirection: "expense" }),
      NOW,
    );
    expect(v.scenario.oneOff).toBe(100);
    expect(v.scenario.monthly).toBe(-40);
  });

  it("rejects NaN, Infinity, negative and absurd amounts", () => {
    expect(validateWhatIf(raw({ oneOffAmount: "abc", oneOffDate: dateStr(1) }), NOW).issues).toContain("amount.invalid");
    expect(validateWhatIf(raw({ oneOffAmount: "Infinity", oneOffDate: dateStr(1) }), NOW).issues).toContain("amount.invalid");
    expect(validateWhatIf(raw({ oneOffAmount: "-5", oneOffDate: dateStr(1) }), NOW).issues).toContain("amount.range");
    expect(validateWhatIf(raw({ monthlyAmount: String(WHATIF_MAX_AMOUNT + 1) }), NOW).issues).toContain("monthly.range");
  });

  it("rejects impossible dates and horizons", () => {
    expect(validateWhatIf(raw({ oneOffAmount: "10", oneOffDate: dateStr(-3) }), NOW).issues).toContain("date.past");
    expect(validateWhatIf(raw({ oneOffAmount: "10", oneOffDate: dateStr(400), horizon: 90 }), NOW).issues).toContain("date.beyond");
    expect(validateWhatIf(raw({ oneOffAmount: "10", oneOffDate: "not-a-date" }), NOW).issues).toContain("date.invalid");
    expect(validateWhatIf(raw({ oneOffAmount: "10", oneOffDate: dateStr(1), horizon: 7 }), NOW).issues).toContain("horizon.invalid");
  });

  it("flags an empty scenario and never produces non-finite values", () => {
    const v = validateWhatIf(raw(), NOW);
    expect(v.issues).toContain("empty");
    expect(Number.isFinite(v.scenario.oneOff)).toBe(true);
    expect(Number.isFinite(v.scenario.monthly)).toBe(true);
  });
});

describe("buildWhatIf projection", () => {
  const base = { accounts, recurring, subscriptions, netWorth: 7000, now: NOW };

  it("matches the existing forecast when the scenario is empty", () => {
    const s = buildWhatIf({ ...base, scenario: { oneOff: 0, oneOffAt: null, monthly: 0, horizon: 90 } });
    const f = buildForecast({ days: 90, accounts, recurring, subscriptions, now: NOW });
    expect(s.scenarioEnd).toBeCloseTo(f.endBalance, 6);
    expect(s.delta).toBe(0);
    expect(s.addedEvents).toBe(0);
  });

  it("applies a one-off change exactly once", () => {
    const s = buildWhatIf({ ...base, scenario: { oneOff: -500, oneOffAt: NOW + 10 * DAY, monthly: 0, horizon: 90 } });
    expect(s.delta).toBeCloseTo(-500, 6);
    expect(s.addedEvents).toBe(1);
    expect(s.netWorthAfter).toBeCloseTo(s.netWorthNow - 500, 6);
  });

  it("repeats a monthly change once per 30 days within the horizon", () => {
    const s = buildWhatIf({ ...base, scenario: { oneOff: 0, oneOffAt: null, monthly: -100, horizon: 90 } });
    expect(s.monthlyOccurrences).toBe(3);
    expect(s.delta).toBeCloseTo(-300, 6);
  });

  it("scales with the horizon and never returns non-finite money", () => {
    for (const horizon of [30, 90, 180, 365] as const) {
      const s = buildWhatIf({ ...base, scenario: { oneOff: 0, oneOffAt: null, monthly: 250, horizon } });
      expect(Number.isFinite(s.scenarioEnd)).toBe(true);
      expect(Number.isFinite(s.delta)).toBe(true);
      expect(s.delta).toBeGreaterThan(0);
    }
  });

  it("detects a shortfall the baseline does not have", () => {
    const s = buildWhatIf({
      ...base,
      accounts: [{ ...accounts[0], balance: 300 } as unknown as Account],
      scenario: { oneOff: -4000, oneOffAt: NOW + 1 * DAY, monthly: 0, horizon: 30 },
    });
    expect(s.scenarioNegativeDate).not.toBeNull();
    expect(s.scenarioLowest).toBeLessThan(0);
  });

  it("honours a safety buffer without mutating it", () => {
    const s = buildWhatIf({
      ...base,
      accounts: [{ ...accounts[0], balance: 1000 } as unknown as Account],
      safetyBuffer: 900,
      scenario: { oneOff: -800, oneOffAt: NOW + 1 * DAY, monthly: 0, horizon: 30 },
    });
    expect(s.scenarioBufferDate).not.toBeNull();
  });

  it("ignores a non-finite net worth instead of propagating it", () => {
    const s = buildWhatIf({ ...base, netWorth: Number.NaN, scenario: { oneOff: -100, oneOffAt: NOW, monthly: 0, horizon: 30 } });
    expect(s.netWorthNow).toBe(0);
    expect(Number.isFinite(s.netWorthAfter)).toBe(true);
  });
});

describe("currency handling", () => {
  it("works on converted display amounts, producing a consistent scaled result", () => {
    const toEur = (n: number) => convertAmount(n, "USD", "EUR");
    const eurAccounts = accounts.map((a) => ({ ...a, balance: toEur(a.balance), currency: "EUR" }) as Account);
    const eurRecurring = recurring.map((r) => ({ ...r, amount: toEur(r.amount), currency: "EUR" }) as Recurring);
    const eurSubs = subscriptions.map((s) => ({ ...s, amount: toEur(s.amount), currency: "EUR" }) as Subscription);

    const usd = buildWhatIf({ accounts, recurring, subscriptions, netWorth: 7000, now: NOW, scenario: { oneOff: -600, oneOffAt: NOW + DAY, monthly: 0, horizon: 90 } });
    const eur = buildWhatIf({ accounts: eurAccounts, recurring: eurRecurring, subscriptions: eurSubs, netWorth: toEur(7000), now: NOW, scenario: { oneOff: toEur(-600), oneOffAt: NOW + DAY, monthly: 0, horizon: 90 } });

    expect(eur.scenarioEnd).toBeCloseTo(toEur(usd.scenarioEnd), 4);
    expect(eur.delta).toBeCloseTo(toEur(usd.delta), 4);
  });
});

describe("read-only invariants", () => {
  it("never mutates the accounts, recurring or subscriptions it receives", () => {
    const snapshot = JSON.stringify({ accounts, recurring, subscriptions });
    buildWhatIf({
      accounts,
      recurring,
      subscriptions,
      netWorth: 7000,
      now: NOW,
      scenario: { oneOff: -900, oneOffAt: NOW + 2 * DAY, monthly: -50, horizon: 365 },
    });
    expect(JSON.stringify({ accounts, recurring, subscriptions })).toBe(snapshot);
  });

  it("produces only synthetic in-memory events, never real records", () => {
    const events = scenarioEvents({ oneOff: -20, oneOffAt: NOW + DAY, monthly: -10, horizon: 90 }, NOW);
    expect(events.length).toBe(4);
    expect(events.every((e) => e.id.startsWith("wi-"))).toBe(true);
  });

  it("caps runaway monthly expansion", () => {
    const events = scenarioEvents({ oneOff: 0, oneOffAt: null, monthly: 1, horizon: 365 }, NOW);
    expect(events.length).toBeLessThanOrEqual(24);
  });
});
