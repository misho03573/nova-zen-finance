import type { Account, Recurring, Subscription, Frequency, BillingFrequency } from "@/lib/nova-store";

/** Account types considered liquid (spendable) for cash-flow purposes. */
const LIQUID: Account["type"][] = ["cash", "bank", "revolut"];

export type ForecastEvent = {
  id: string;
  title: string;
  /** Signed amount, already converted into the display currency. */
  amount: number;
  date: string; // ISO
  kind: "recurring" | "subscription";
  category?: string;
};

export type ForecastResult = {
  days: number;
  startBalance: number;
  income: number;
  expenses: number;
  endBalance: number;
  /** Lowest running balance reached at any point in the window. */
  lowest: number;
  lowestDate: string | null;
  events: ForecastEvent[];
  /** Running balance after each event, aligned with `events`. */
  running: number[];
  /** First date the running balance goes below 0, if any. */
  negativeDate: string | null;
  /** First date the running balance goes below the safety buffer, if any. */
  bufferDate: string | null;
  /** Subscriptions skipped because a recurring item covers the same payment. */
  duplicatesSkipped: number;
};

const DAY = 86400000;

export function liquidBalance(accounts: Account[]): number {
  return accounts
    .filter((a) => LIQUID.includes(a.type))
    .reduce((s, a) => s + a.balance, 0);
}

function stepMs(f: Frequency | BillingFrequency): number {
  switch (f) {
    case "weekly":
      return 7 * DAY;
    case "quarterly":
      return 91 * DAY;
    case "yearly":
      return 365 * DAY;
    default:
      return 30 * DAY;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A recurring item that clearly represents the same payment as a subscription. */
function subscriptionIsDuplicate(sub: Subscription, recurring: Recurring[]): boolean {
  const n = norm(sub.name);
  const m = sub.merchant ? norm(sub.merchant) : "";
  return recurring.some((r) => {
    const t = norm(r.title);
    if (!t) return false;
    const nameMatch = (n && (t.includes(n) || n.includes(t))) || (m && (t.includes(m) || m.includes(t)));
    if (!nameMatch) return false;
    const a = Math.abs(r.amount);
    const b = Math.abs(sub.amount);
    if (a === 0 || b === 0) return false;
    return Math.abs(a - b) / Math.max(a, b) <= 0.05;
  });
}

/** Transfers never change combined liquid wealth, so they are excluded. */
function isTransferLike(r: Recurring): boolean {
  return r.category === "transfer";
}

function expand(
  startIso: string,
  freq: Frequency | BillingFrequency,
  from: number,
  to: number,
): number[] {
  const out: number[] = [];
  const step = stepMs(freq);
  let d = +new Date(startIso);
  if (!Number.isFinite(d)) return out;
  // Roll a stale next-date forward to the first occurrence inside the window.
  let guard = 0;
  while (d < from && guard++ < 400) d += step;
  while (d <= to && out.length < 400) {
    out.push(d);
    d += step;
  }
  return out;
}

/**
 * Build a cash-flow projection. All monetary inputs must already be converted
 * into the display currency exactly once (via `useDisplayState`); native
 * amounts are never mutated here.
 */
export function buildForecast(args: {
  days: number;
  accounts: Account[];
  recurring: Recurring[];
  subscriptions: Subscription[];
  safetyBuffer?: number;
  now?: number;
}): ForecastResult {
  const { days, accounts, recurring, subscriptions } = args;
  const buffer = args.safetyBuffer ?? 0;
  const now = args.now ?? Date.now();
  const end = now + days * DAY;
  const start = liquidBalance(accounts);

  const events: ForecastEvent[] = [];

  for (const r of recurring) {
    if (isTransferLike(r)) continue;
    for (const ts of expand(r.nextDate, r.frequency, now, end)) {
      events.push({
        id: `r-${r.id}-${ts}`,
        title: r.title,
        amount: r.amount,
        date: new Date(ts).toISOString(),
        kind: "recurring",
        category: r.category,
      });
    }
  }

  let duplicatesSkipped = 0;
  for (const s of subscriptions) {
    if ((s.status ?? "active") !== "active") continue;
    if (subscriptionIsDuplicate(s, recurring.filter((r) => !isTransferLike(r)))) {
      duplicatesSkipped++;
      continue;
    }
    for (const ts of expand(s.nextDate, s.frequency ?? "monthly", now, end)) {
      events.push({
        id: `s-${s.id}-${ts}`,
        title: s.name,
        amount: -Math.abs(s.amount),
        date: new Date(ts).toISOString(),
        kind: "subscription",
        category: s.category,
      });
    }
  }

  events.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  let bal = start;
  let income = 0;
  let expenses = 0;
  let lowest = start;
  let lowestDate: string | null = null;
  let negativeDate: string | null = null;
  let bufferDate: string | null = null;
  const running: number[] = [];

  for (const e of events) {
    if (e.amount >= 0) income += e.amount;
    else expenses += -e.amount;
    bal += e.amount;
    running.push(bal);
    if (bal < lowest) {
      lowest = bal;
      lowestDate = e.date;
    }
    if (bal < 0 && !negativeDate) negativeDate = e.date;
    if (buffer > 0 && bal < buffer && !bufferDate) bufferDate = e.date;
  }

  return {
    days,
    startBalance: start,
    income,
    expenses,
    endBalance: bal,
    lowest,
    lowestDate,
    events,
    running,
    negativeDate,
    bufferDate,
    duplicatesSkipped,
  };
}
