/**
 * Financial Context — the single deterministic snapshot of a user's finances.
 *
 * Every downstream layer (Smart Notifications, the Financial Intelligence
 * insights, and the NOVA AI assistant) reads this instead of re-deriving
 * numbers from raw state, so all three always agree.
 *
 * CURRENCY CONTRACT: every input must already be converted into the active
 * display currency exactly once, via `useDisplayState()`. Nothing in this
 * module converts anything — it only aggregates.
 */
import type {
  Account,
  Budget,
  Goal,
  Liability,
  Recurring,
  Subscription,
  Transaction,
} from "@/lib/nova-store";
import { isAdjustment } from "@/lib/nova-store";
import { buildForecast, type ForecastResult } from "@/lib/forecast";
import { computeRunway, type RunwayResult } from "@/lib/runway";
import { monthKey, isTransfer } from "@/lib/monthly-review";
import { resolveMerchant, type MerchantAlias } from "@/lib/merchant";

export type CategorySpend = { category: string; amount: number };

export type BudgetStatus = {
  id: string;
  category: string;
  limit: number;
  spent: number;
  /** 0..n — 1 means exactly at the limit. */
  pct: number;
  over: boolean;
  /** True when spending crossed 80% but is still within the limit. */
  near: boolean;
};

export type UpcomingItem = {
  id: string;
  title: string;
  /** Signed: negative for money leaving the account. */
  amount: number;
  date: string;
  days: number;
  kind: "recurring" | "subscription";
};

export type MerchantSpend = { key: string; label: string; amount: number; count: number };

export type FinancialContext = {
  now: number;
  month: string;
  prevMonth: string;

  /** Net Worth block — Assets − Liabilities, no other terms. */
  assets: number;
  liabilities: number;
  netWorth: number;
  liquid: number;

  income: number;
  expenses: number;
  savings: number;
  /** null when the month has no income at all. */
  savingsRate: number | null;
  txCount: number;

  prevIncome: number;
  prevExpenses: number;

  topCategories: CategorySpend[];
  prevCategories: Record<string, number>;
  topMerchants: MerchantSpend[];

  budgets: BudgetStatus[];
  upcoming: UpcomingItem[];
  forecast30: ForecastResult;
  runway: RunwayResult;

  goals: { id: string; name: string; saved: number; target: number; pct: number }[];
  subscriptions: { count: number; monthly: number };
  debt: { total: number; highestApr: { name: string; apr: number } | null; count: number };

  /** Safety buffer already converted into the display currency. */
  buffer: number;
  hasData: boolean;
};

const DAY = 86400000;
const UPCOMING_DAYS = 14;

function inMonth(iso: string, key: string) {
  return iso.slice(0, 7) === key;
}

/** Real income/expense flows: no transfers, no reconciliation adjustments. */
function isFlow(t: Transaction): boolean {
  return !isAdjustment(t) && !isTransfer(t);
}

function monthlyCost(s: Subscription): number {
  const amount = Math.abs(s.amount);
  switch (s.frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

export function buildFinancialContext(args: {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  liabilities: Liability[];
  recurring: Recurring[];
  subscriptions: Subscription[];
  merchants?: MerchantAlias[];
  essentialCategories?: string[];
  emergencyTargetMonths?: number;
  /** Safety buffer, already converted into the display currency. */
  buffer?: number;
  now?: number;
}): FinancialContext {
  const now = args.now ?? Date.now();
  const nowDate = new Date(now);
  const month = monthKey(nowDate);
  const prevMonth = monthKey(new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1));
  const buffer = args.buffer ?? 0;

  const assets = args.accounts.reduce((s, a) => s + a.balance, 0);
  const liabilities = args.liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
  const liquid = args.accounts
    .filter((a) => a.type === "cash" || a.type === "bank" || a.type === "revolut")
    .reduce((s, a) => s + a.balance, 0);

  const flows = args.transactions.filter(isFlow);
  const monthFlows = flows.filter((t) => inMonth(t.date, month));
  const prevFlows = flows.filter((t) => inMonth(t.date, prevMonth));

  let income = 0;
  let expenses = 0;
  const byCat = new Map<string, number>();
  const byMerchant = new Map<string, MerchantSpend>();
  for (const t of monthFlows) {
    if (t.amount >= 0) {
      income += t.amount;
      continue;
    }
    const v = -t.amount;
    expenses += v;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + v);
    const m = resolveMerchant(t.title || "", args.merchants ?? []);
    if (!m.key) continue;
    const row = byMerchant.get(m.key) ?? { key: m.key, label: m.label, amount: 0, count: 0 };
    row.amount += v;
    row.count += 1;
    byMerchant.set(m.key, row);
  }

  let prevIncome = 0;
  let prevExpenses = 0;
  const prevCategories: Record<string, number> = {};
  for (const t of prevFlows) {
    if (t.amount >= 0) {
      prevIncome += t.amount;
      continue;
    }
    const v = -t.amount;
    prevExpenses += v;
    prevCategories[t.category] = (prevCategories[t.category] ?? 0) + v;
  }

  const topCategories = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const budgets: BudgetStatus[] = args.budgets.map((b) => {
    const spent = byCat.get(b.category) ?? 0;
    const pct = b.limit > 0 ? spent / b.limit : 0;
    return {
      id: b.id,
      category: b.category,
      limit: b.limit,
      spent,
      pct,
      over: b.limit > 0 && spent > b.limit,
      near: b.limit > 0 && spent <= b.limit && pct >= 0.8,
    };
  });

  const forecast30 = buildForecast({
    days: 30,
    accounts: args.accounts,
    recurring: args.recurring,
    subscriptions: args.subscriptions,
    safetyBuffer: buffer,
    now,
  });

  const upcoming: UpcomingItem[] = forecast30.events
    .filter((e) => e.date <= new Date(now + UPCOMING_DAYS * DAY).toISOString())
    .map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      date: e.date,
      days: Math.max(0, Math.round((Date.parse(e.date) - now) / DAY)),
      kind: e.kind,
    }));

  const runway = computeRunway({
    accounts: args.accounts,
    transactions: args.transactions,
    essentialCategories: args.essentialCategories ?? [],
    targetMonths: args.emergencyTargetMonths ?? 6,
    now: nowDate,
  });

  const goals = args.goals.map((g) => ({
    id: g.id,
    name: g.name,
    saved: g.saved,
    target: g.target,
    pct: g.target > 0 ? Math.min(1, g.saved / g.target) : 0,
  }));

  const activeSubs = args.subscriptions.filter((s) => (s.status ?? "active") === "active");
  const withApr = args.liabilities
    .filter((l) => typeof l.apr === "number" && l.apr > 0 && Math.abs(l.balance) > 0)
    .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];

  return {
    now,
    month,
    prevMonth,
    assets,
    liabilities,
    netWorth: assets - liabilities,
    liquid,
    income,
    expenses,
    savings: income - expenses,
    savingsRate: income > 0 ? ((income - expenses) / income) * 100 : null,
    txCount: monthFlows.length,
    prevIncome,
    prevExpenses,
    topCategories,
    prevCategories,
    topMerchants: [...byMerchant.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
    budgets,
    upcoming,
    forecast30,
    runway,
    goals,
    subscriptions: {
      count: activeSubs.length,
      monthly: activeSubs.reduce((s, x) => s + monthlyCost(x), 0),
    },
    debt: {
      total: liabilities,
      highestApr: withApr ? { name: withApr.name, apr: withApr.apr as number } : null,
      count: args.liabilities.filter((l) => Math.abs(l.balance) > 0).length,
    },
    buffer,
    hasData: args.transactions.length > 0 || args.accounts.length > 0,
  };
}
