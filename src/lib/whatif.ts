/**
 * What-If planner — a read-only cash-flow sandbox.
 *
 * Pure functions only: nothing here creates, mutates, syncs or persists any
 * transaction, budget, goal, account, subscription or AI context. Every input
 * is validated so NaN/Infinity/impossible ranges can never reach a result.
 * All monetary inputs must already be converted into the display currency
 * exactly once (via `useDisplayState`).
 */
import { buildForecast, type ForecastEvent, type ForecastResult } from "@/lib/forecast";
import type { Account, Recurring, Subscription } from "@/lib/nova-store";

const DAY = 86_400_000;
export const WHATIF_HORIZONS = [30, 90, 180, 365] as const;
export type WhatIfHorizon = (typeof WHATIF_HORIZONS)[number];
export const WHATIF_MAX_AMOUNT = 1_000_000_000;

export type WhatIfIssue =
  | "amount.invalid"
  | "amount.range"
  | "monthly.invalid"
  | "monthly.range"
  | "date.invalid"
  | "date.past"
  | "date.beyond"
  | "horizon.invalid"
  | "empty";

export type WhatIfDirection = "income" | "expense";

/** Raw, user-typed values straight from the form. */
export type WhatIfRawInput = {
  oneOffAmount: string;
  oneOffDirection: WhatIfDirection;
  oneOffDate: string;
  monthlyAmount: string;
  monthlyDirection: WhatIfDirection;
  horizon: number;
};

/** Validated, finite scenario values. */
export type WhatIfScenario = {
  /** Signed, finite one-off amount in display currency (0 when unused). */
  oneOff: number;
  /** Timestamp of the one-off change (null when unused). */
  oneOffAt: number | null;
  /** Signed, finite monthly recurring change in display currency (0 when unused). */
  monthly: number;
  horizon: WhatIfHorizon;
};

export type WhatIfValidation = {
  scenario: WhatIfScenario;
  issues: WhatIfIssue[];
  /** True when the scenario is usable: no issues and at least one change. */
  ok: boolean;
};

export const EMPTY_RAW: WhatIfRawInput = {
  oneOffAmount: "",
  oneOffDirection: "expense",
  oneOffDate: "",
  monthlyAmount: "",
  monthlyDirection: "expense",
  horizon: 90,
};

function parseAmount(raw: string): { value: number; issue: "invalid" | "range" | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: 0, issue: null };
  const numeric = Number.parseFloat(trimmed.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return { value: 0, issue: "invalid" };
  if (numeric < 0 || numeric > WHATIF_MAX_AMOUNT) return { value: 0, issue: "range" };
  return { value: Math.round(numeric * 100) / 100, issue: null };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Validates raw form values without ever throwing. */
export function validateWhatIf(raw: WhatIfRawInput, now = Date.now()): WhatIfValidation {
  const issues: WhatIfIssue[] = [];

  const horizon = (WHATIF_HORIZONS as readonly number[]).includes(raw.horizon)
    ? (raw.horizon as WhatIfHorizon)
    : (() => {
        issues.push("horizon.invalid");
        return 90 as WhatIfHorizon;
      })();

  const one = parseAmount(raw.oneOffAmount);
  if (one.issue) issues.push(one.issue === "invalid" ? "amount.invalid" : "amount.range");
  const monthlyParsed = parseAmount(raw.monthlyAmount);
  if (monthlyParsed.issue) issues.push(monthlyParsed.issue === "invalid" ? "monthly.invalid" : "monthly.range");

  const sign = (d: WhatIfDirection) => (d === "income" ? 1 : -1);
  const oneOff = one.value * sign(raw.oneOffDirection);
  const monthly = monthlyParsed.value * sign(raw.monthlyDirection);

  let oneOffAt: number | null = null;
  if (one.value > 0) {
    const raw_date = raw.oneOffDate.trim();
    const parsed = raw_date ? Date.parse(`${raw_date}T12:00:00`) : now;
    if (!Number.isFinite(parsed)) {
      issues.push("date.invalid");
    } else if (startOfDay(parsed) < startOfDay(now)) {
      issues.push("date.past");
    } else if (parsed > now + horizon * DAY) {
      issues.push("date.beyond");
    } else {
      oneOffAt = parsed;
    }
  }

  if (one.value === 0 && monthlyParsed.value === 0 && issues.length === 0) {
    issues.push("empty");
  }

  return {
    scenario: { oneOff: one.value > 0 ? oneOff : 0, oneOffAt, monthly: monthlyParsed.value > 0 ? monthly : 0, horizon },
    issues,
    ok: issues.length === 0,
  };
}

export type WhatIfSummary = {
  horizon: WhatIfHorizon;
  startBalance: number;
  baselineEnd: number;
  scenarioEnd: number;
  /** scenarioEnd - baselineEnd; the pure impact of the scenario. */
  delta: number;
  baselineLowest: number;
  scenarioLowest: number;
  scenarioNegativeDate: string | null;
  scenarioBufferDate: string | null;
  scenarioIncome: number;
  scenarioExpenses: number;
  /** Net worth today and with the scenario's cash impact applied. */
  netWorthNow: number;
  netWorthAfter: number;
  /** Count of scenario-only events injected into the projection. */
  addedEvents: number;
  /** Monthly occurrences inside the horizon. */
  monthlyOccurrences: number;
  events: ForecastEvent[];
  running: number[];
};

function rollup(start: number, events: ForecastEvent[], buffer: number) {
  let bal = start;
  let income = 0;
  let expenses = 0;
  let lowest = start;
  let negativeDate: string | null = null;
  let bufferDate: string | null = null;
  const running: number[] = [];
  for (const e of events) {
    if (e.amount >= 0) income += e.amount;
    else expenses += -e.amount;
    bal += e.amount;
    running.push(bal);
    if (bal < lowest) lowest = bal;
    if (bal < 0 && !negativeDate) negativeDate = e.date;
    if (buffer > 0 && bal < buffer && !bufferDate) bufferDate = e.date;
  }
  return { end: bal, income, expenses, lowest, negativeDate, bufferDate, running };
}

/** Synthetic, in-memory scenario events. They are never written anywhere. */
export function scenarioEvents(scenario: WhatIfScenario, now: number): ForecastEvent[] {
  const out: ForecastEvent[] = [];
  const end = now + scenario.horizon * DAY;
  if (scenario.oneOff !== 0 && scenario.oneOffAt !== null && Number.isFinite(scenario.oneOff)) {
    out.push({
      id: `wi-once-${scenario.oneOffAt}`,
      title: "whatif.oneOff",
      amount: scenario.oneOff,
      date: new Date(scenario.oneOffAt).toISOString(),
      kind: "recurring",
    });
  }
  if (scenario.monthly !== 0 && Number.isFinite(scenario.monthly)) {
    let ts = now + 30 * DAY;
    let guard = 0;
    while (ts <= end && guard++ < 24) {
      out.push({
        id: `wi-monthly-${ts}`,
        title: "whatif.monthly",
        amount: scenario.monthly,
        date: new Date(ts).toISOString(),
        kind: "recurring",
      });
      ts += 30 * DAY;
    }
  }
  return out;
}

/**
 * Projects a scenario on top of the user's real aggregate state.
 * Returns a summary only — the caller has nothing to persist.
 */
export function buildWhatIf(args: {
  scenario: WhatIfScenario;
  accounts: Account[];
  recurring: Recurring[];
  subscriptions: Subscription[];
  netWorth: number;
  safetyBuffer?: number;
  now?: number;
}): WhatIfSummary {
  const now = args.now ?? Date.now();
  const buffer = Number.isFinite(args.safetyBuffer ?? 0) ? Math.max(0, args.safetyBuffer ?? 0) : 0;
  const baseline: ForecastResult = buildForecast({
    days: args.scenario.horizon,
    accounts: args.accounts,
    recurring: args.recurring,
    subscriptions: args.subscriptions,
    safetyBuffer: buffer,
    now,
  });

  const extra = scenarioEvents(args.scenario, now);
  const merged = [...baseline.events, ...extra].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const rolled = rollup(baseline.startBalance, merged, buffer);

  const netWorthNow = Number.isFinite(args.netWorth) ? args.netWorth : 0;
  const delta = rolled.end - baseline.endBalance;

  return {
    horizon: args.scenario.horizon,
    startBalance: baseline.startBalance,
    baselineEnd: baseline.endBalance,
    scenarioEnd: rolled.end,
    delta,
    baselineLowest: baseline.lowest,
    scenarioLowest: rolled.lowest,
    scenarioNegativeDate: rolled.negativeDate,
    scenarioBufferDate: rolled.bufferDate,
    scenarioIncome: rolled.income,
    scenarioExpenses: rolled.expenses,
    netWorthNow,
    netWorthAfter: netWorthNow + delta,
    addedEvents: extra.length,
    monthlyOccurrences: extra.filter((e) => e.id.startsWith("wi-monthly")).length,
    events: merged,
    running: rolled.running,
  };
}
