/**
 * Cash-flow calendar — a strictly read-only projection of the user's existing
 * financial state onto a day/week/month timeline.
 *
 * Pure functions only: nothing here creates, edits, deletes, syncs or persists
 * any transaction, budget, goal, account, subscription, setting or AI context.
 * Every monetary input must already be converted into the display currency
 * exactly once (via `useDisplayState`). All inputs are sanitized so malformed
 * records can never crash the calendar or produce NaN/Infinity.
 */
import { buildForecast } from "@/lib/forecast";
import type { Account, Recurring, Subscription, Transaction } from "@/lib/nova-store";

const DAY = 86_400_000;

export const CAL_VIEWS = ["day", "week", "month"] as const;
export type CalView = (typeof CAL_VIEWS)[number];

export type CalStatus = "posted" | "expected";
export type CalSource = "transaction" | "recurring" | "subscription";

export type CalEvent = {
  id: string;
  title: string;
  /** Signed, finite amount in the display currency. */
  amount: number;
  dateIso: string;
  status: CalStatus;
  source: CalSource;
  category?: string;
  /** Internal movement between the user's own accounts — never counts as cash flow. */
  transfer?: boolean;
  /** Balance reconciliation — moves balance but is not income or expense. */
  adjustment?: boolean;
};

export type CalDay = {
  /** Local calendar key, `YYYY-MM-DD`. */
  key: string;
  ts: number;
  income: number;
  expense: number;
  /** income - expense for this day (transfers and adjustments excluded). */
  net: number;
  /**
   * Running available cash at the end of this day, from today forward.
   * `null` for past days: history is not re-simulated.
   */
  balance: number | null;
  events: CalEvent[];
  hasPosted: boolean;
  hasExpected: boolean;
};

export type CalResult = {
  start: number;
  end: number;
  days: CalDay[];
  /** Spendable cash across cash/bank/Revolut accounts right now. */
  startBalance: number;
  /** Running balance at the end of the visible range (null when fully in the past). */
  endBalance: number | null;
  expectedIncome: number;
  expectedExpense: number;
  postedIncome: number;
  postedExpense: number;
  lowestBalance: number | null;
  lowestDateKey: string | null;
  /** Subscriptions skipped because a recurring item covers the same payment. */
  duplicatesSkipped: number;
};

const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parses any stored date value, returning null when it is unusable. */
export function safeTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Visible [start, end] day range for a view anchored on `cursor`. */
export function rangeFor(view: CalView, cursor: number): { start: number; end: number } {
  const anchor = Number.isFinite(cursor) ? cursor : Date.now();
  const d = new Date(anchor);
  if (view === "day") {
    const s = startOfDay(d.getTime());
    return { start: s, end: s };
  }
  if (view === "week") {
    const offset = (d.getDay() + 6) % 7; // Monday-first
    const s = startOfDay(d.getTime() - offset * DAY);
    return { start: s, end: startOfDay(s + 6 * DAY) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: startOfDay(first.getTime()), end: startOfDay(last.getTime()) };
}

/** Moves the cursor one view-length backwards or forwards. */
export function shiftCursor(view: CalView, cursor: number, dir: -1 | 1): number {
  const d = new Date(Number.isFinite(cursor) ? cursor : Date.now());
  if (view === "day") return startOfDay(d.getTime() + dir * DAY);
  if (view === "week") return startOfDay(d.getTime() + dir * 7 * DAY);
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime());
}

function isTransfer(t: Transaction): boolean {
  return Boolean(t.transferId) || t.category === "transfer";
}

/**
 * Builds the calendar for a visible range. Posted activity comes from real
 * transactions; expected activity is projected from recurring items and active
 * subscriptions through the shared forecast engine (which already drops
 * transfer-like recurring items and duplicate subscriptions).
 */
export function buildCalendar(args: {
  view: CalView;
  cursor: number;
  accounts: Account[];
  transactions: Transaction[];
  recurring: Recurring[];
  subscriptions: Subscription[];
  now?: number;
}): CalResult {
  const now = Number.isFinite(args.now ?? NaN) ? (args.now as number) : Date.now();
  const today = startOfDay(now);
  const { start, end } = rangeFor(args.view, args.cursor);

  const days: CalDay[] = [];
  const byKey = new Map<string, CalDay>();
  for (let ts = start, guard = 0; ts <= end && guard < 400; guard++) {
    const day: CalDay = {
      key: dayKey(ts),
      ts,
      income: 0,
      expense: 0,
      net: 0,
      balance: null,
      events: [],
      hasPosted: false,
      hasExpected: false,
    };
    days.push(day);
    byKey.set(day.key, day);
    ts = startOfDay(ts + DAY + 3_600_000); // DST-safe step
  }

  const push = (e: CalEvent) => {
    const day = byKey.get(dayKey(+new Date(e.dateIso)));
    if (!day) return;
    day.events.push(e);
    if (e.status === "posted") day.hasPosted = true;
    else day.hasExpected = true;
    if (e.transfer || e.adjustment) return;
    if (e.amount >= 0) day.income += e.amount;
    else day.expense += -e.amount;
  };

  // ---- Posted activity (real transactions, up to now) ----
  for (const t of Array.isArray(args.transactions) ? args.transactions : []) {
    if (!t || typeof t !== "object") continue;
    const ts = safeTime(t.date);
    if (ts === null || ts > now) continue;
    push({
      id: `t-${String(t.id ?? ts)}`,
      title: typeof t.title === "string" && t.title ? t.title : "",
      amount: num(t.amount),
      dateIso: new Date(ts).toISOString(),
      status: "posted",
      source: "transaction",
      category: typeof t.category === "string" ? t.category : undefined,
      transfer: isTransfer(t),
      adjustment: t.kind === "adjustment",
    });
  }

  // ---- Expected activity (recurring + subscriptions, from now forward) ----
  const horizon = Math.max(1, Math.min(800, Math.ceil((end + DAY - today) / DAY)));
  const forecast = buildForecast({
    days: horizon,
    accounts: Array.isArray(args.accounts) ? args.accounts : [],
    recurring: (Array.isArray(args.recurring) ? args.recurring : []).filter(
      (r) => r && safeTime(r.nextDate) !== null && Number.isFinite(r.amount),
    ),
    subscriptions: (Array.isArray(args.subscriptions) ? args.subscriptions : []).filter(
      (s) => s && safeTime(s.nextDate) !== null && Number.isFinite(s.amount),
    ),
    now,
  });

  // Expected movement between today and a future range start still affects the
  // balance shown inside the range, so it is carried forward.
  let carried = 0;
  for (const e of forecast.events) {
    const ts = safeTime(e.date);
    if (ts === null || ts < today) continue;
    if (ts < start) {
      carried += num(e.amount);
      continue;
    }

    push({
      id: `f-${e.id}`,
      title: e.title,
      amount: num(e.amount),
      dateIso: new Date(ts).toISOString(),
      status: "expected",
      source: e.kind === "subscription" ? "subscription" : "recurring",
      category: e.category,
    });
  }

  // ---- Totals and the running available-cash balance ----
  let running = num(forecast.startBalance);
  let lowestBalance: number | null = null;
  let lowestDateKey: string | null = null;
  let expectedIncome = 0;
  let expectedExpense = 0;
  let postedIncome = 0;
  let postedExpense = 0;
  let endBalance: number | null = null;

  for (const day of days) {
    day.events.sort((a, b) => +new Date(a.dateIso) - +new Date(b.dateIso));
    day.net = day.income - day.expense;

    for (const e of day.events) {
      if (e.transfer || e.adjustment) continue;
      if (e.status === "expected") {
        if (e.amount >= 0) expectedIncome += e.amount;
        else expectedExpense += -e.amount;
      } else if (e.amount >= 0) postedIncome += e.amount;
      else postedExpense += -e.amount;
    }

    if (day.ts < today) continue;
    // Today's posted movement is already inside the account balances.
    const expectedNet = day.events.reduce(
      (s, e) => (e.status === "expected" && !e.transfer && !e.adjustment ? s + e.amount : s),
      0,
    );
    running += expectedNet;
    day.balance = running;
    endBalance = running;
    if (lowestBalance === null || running < lowestBalance) {
      lowestBalance = running;
      lowestDateKey = day.key;
    }
  }

  return {
    start,
    end,
    days,
    startBalance: num(forecast.startBalance),
    endBalance,
    expectedIncome,
    expectedExpense,
    postedIncome,
    postedExpense,
    lowestBalance,
    lowestDateKey,
    duplicatesSkipped: forecast.duplicatesSkipped,
  };
}
