import { describe, it, expect } from "vitest";
import { buildForecast, liquidBalance } from "./forecast";
import type { Account, Recurring, Subscription } from "./nova-store";

const NOW = Date.UTC(2026, 7, 1);
const day = 86400000;
const ahead = (n: number) => new Date(NOW + n * day).toISOString();

const acc = (over: Partial<Account> = {}): Account => ({
  id: "a1", name: "Bank", number: "", holder: "", balance: 1200,
  gradient: "", brand: "", type: "bank", ...over,
});
const rec = (over: Partial<Recurring>): Recurring => ({
  id: "r1", title: "Rent", category: "rent", amount: -980, accountId: "a1",
  frequency: "monthly", nextDate: ahead(5), ...over,
});
const sub = (over: Partial<Subscription>): Subscription => ({
  id: "s1", name: "Netflix", amount: 15.99, category: "entertainment",
  nextDate: ahead(3), color: "#fff", emoji: "🎬", ...over,
});

describe("cash flow forecast", () => {
  it("1. salary + monthly bills", () => {
    const f = buildForecast({ days: 30, accounts: [acc()], subscriptions: [],
      recurring: [rec({}), rec({ id: "r2", title: "Salary", category: "salary", amount: 1500, nextDate: ahead(2) })], now: NOW });
    expect(f.startBalance).toBe(1200);
    expect(f.income).toBe(1500);
    expect(f.expenses).toBe(980);
    expect(f.endBalance).toBe(1720);
  });
  it("2. expenses larger than income", () => {
    const f = buildForecast({ days: 30, accounts: [acc({ balance: 100 })], subscriptions: [],
      recurring: [rec({ amount: -500 })], now: NOW });
    expect(f.endBalance).toBe(-400);
    expect(f.negativeDate).not.toBeNull();
  });
  it("3. active subscription is counted", () => {
    const f = buildForecast({ days: 30, accounts: [acc()], recurring: [], subscriptions: [sub({})], now: NOW });
    expect(f.expenses).toBeCloseTo(15.99);
  });
  it("4. paused/cancelled subscriptions are ignored", () => {
    const f = buildForecast({ days: 30, accounts: [acc()], recurring: [],
      subscriptions: [sub({ status: "paused" }), sub({ id: "s2", status: "cancelled" })], now: NOW });
    expect(f.events).toHaveLength(0);
  });
  it("5. internal transfers do not change liquid wealth", () => {
    const f = buildForecast({ days: 30, accounts: [acc()], subscriptions: [],
      recurring: [rec({ id: "t1", title: "To savings", category: "transfer", amount: -300 })], now: NOW });
    expect(f.endBalance).toBe(1200);
  });
  it("6. duplicate subscription vs recurring counted once", () => {
    const f = buildForecast({ days: 30, accounts: [acc()],
      recurring: [rec({ id: "r9", title: "Netflix", category: "entertainment", amount: -15.99 })],
      subscriptions: [sub({})], now: NOW });
    expect(f.duplicatesSkipped).toBe(1);
    expect(f.expenses).toBeCloseTo(15.99);
  });
  it("7. no recurring data yields an empty forecast", () => {
    const f = buildForecast({ days: 90, accounts: [acc()], recurring: [], subscriptions: [], now: NOW });
    expect(f.events).toHaveLength(0);
    expect(f.endBalance).toBe(f.startBalance);
  });
  it("8. safety buffer breach is detected before zero", () => {
    const f = buildForecast({ days: 30, accounts: [acc({ balance: 300 })], subscriptions: [],
      recurring: [rec({ amount: -150 })], safetyBuffer: 200, now: NOW });
    expect(f.bufferDate).not.toBeNull();
    expect(f.negativeDate).toBeNull();
    expect(f.lowest).toBe(150);
  });
  it("liquid balance excludes trading and crypto", () => {
    expect(liquidBalance([acc(), acc({ id: "a2", type: "crypto", balance: 5000 })])).toBe(1200);
  });
});
