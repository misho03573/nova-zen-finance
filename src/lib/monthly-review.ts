import type { Transaction, Budget, Goal, Subscription } from "@/lib/nova-store";
import { subscriptionMonthlyAmount } from "@/lib/nova-store";
import { convertAmount, type CurrencyCode } from "@/lib/currency";
import type { NetWorthSnapshot } from "@/lib/networth-history";
import { SNAPSHOT_BASE } from "@/lib/networth-history";

/** `YYYY-MM` key for a month. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

export function parseMonthKey(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

/** Last N month keys, newest first, starting at the current month. */
export function recentMonthKeys(count = 12, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(monthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  }
  return out;
}

/** A transfer leg, or a balance-reconciliation record, never counts as income or expense. */
export function isTransfer(t: Transaction): boolean {
  return Boolean(t.transferId) || t.category === "transfer" || t.kind === "adjustment";
}

function inMonth(isoStr: string, key: string): boolean {
  return monthKey(new Date(isoStr)) === key;
}

export type BudgetPerf = {
  id: string;
  category: string;
  limit: number;
  spent: number;
  over: boolean;
};

export type MonthlyReview = {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  /** null when there is no income in the month (rate is undefined, not 0). */
  savingsRate: number | null;
  txCount: number;
  transferCount: number;
  topCategory: { category: string; amount: number } | null;
  largestExpense: Transaction | null;
  budgets: BudgetPerf[];
  budgetsUnder: number;
  budgetsOver: number;
  /** null when Net Worth history has no usable baseline for this month. */
  netWorthChange: number | null;
  goals: { id: string; name: string; saved: number; target: number; pct: number }[];
  /** Subscription cost for the month, excluding charges already logged as transactions. */
  subscriptionTotal: number;
  subscriptionsCounted: number;
  subscriptionsMatched: number;
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * All inputs must already be converted into the active display currency
 * exactly once (via `useDisplayState`), except `history`, which is stored in
 * the neutral USD base and converted here.
 */
export function computeMonthlyReview(args: {
  month: string;
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  subscriptions: Subscription[];
  history: NetWorthSnapshot[];
  to: CurrencyCode;
}): MonthlyReview {
  const { month, to } = args;
  const monthTx = args.transactions.filter((t) => inMonth(t.date, month));
  const flows = monthTx.filter((t) => !isTransfer(t));

  let income = 0;
  let expenses = 0;
  for (const t of flows) {
    if (t.amount >= 0) income += t.amount;
    else expenses += -t.amount;
  }
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : null;

  const byCat = new Map<string, number>();
  for (const t of flows) {
    if (t.amount >= 0) continue;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + -t.amount);
  }
  const topEntry = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = topEntry ? { category: topEntry[0], amount: topEntry[1] } : null;

  const largestExpense =
    flows.filter((t) => t.amount < 0).sort((a, b) => a.amount - b.amount)[0] ?? null;

  const budgets: BudgetPerf[] = args.budgets.map((b) => {
    const spent = byCat.get(b.category) ?? 0;
    return { id: b.id, category: b.category, limit: b.limit, spent, over: spent > b.limit };
  });

  // Net worth change: real snapshots only. Baseline = last snapshot strictly
  // before the month; end = last snapshot within the month.
  const start = parseMonthKey(month);
  const startKey = `${month}-01`;
  const endKey = monthKey(new Date(start.getFullYear(), start.getMonth() + 1, 1));
  const sorted = [...args.history].sort((a, b) => (a.date < b.date ? -1 : 1));
  const baseline = [...sorted].reverse().find((s) => s.date < startKey);
  const end = [...sorted].reverse().find((s) => s.date >= startKey && s.date.slice(0, 7) < endKey);
  const netWorthChange =
    baseline && end
      ? convertAmount(end.net - baseline.net, (end.base ?? SNAPSHOT_BASE) as CurrencyCode, to)
      : null;

  const goals = args.goals
    .filter((g) => g.target > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      saved: g.saved,
      target: g.target,
      pct: Math.min(100, (g.saved / g.target) * 100),
    }));

  // Subscriptions: only active ones, and skip any whose charge already shows
  // up as a real transaction this month (avoids double counting).
  const titles = monthTx.map((t) => norm(t.title));
  let subscriptionTotal = 0;
  let subscriptionsCounted = 0;
  let subscriptionsMatched = 0;
  for (const s of args.subscriptions) {
    if ((s.status ?? "active") !== "active") continue;
    const names = [s.name, s.merchant].filter(Boolean).map((n) => norm(n as string));
    const matched = names.some((n) => n.length > 2 && titles.some((t) => t.includes(n)));
    if (matched) {
      subscriptionsMatched++;
      continue;
    }
    subscriptionTotal += subscriptionMonthlyAmount(s);
    subscriptionsCounted++;
  }

  return {
    month,
    income,
    expenses,
    savings,
    savingsRate,
    txCount: flows.length,
    transferCount: monthTx.length - flows.length,
    topCategory,
    largestExpense,
    budgets,
    budgetsUnder: budgets.filter((b) => !b.over).length,
    budgetsOver: budgets.filter((b) => b.over).length,
    netWorthChange,
    goals,
    subscriptionTotal,
    subscriptionsCounted,
    subscriptionsMatched,
  };
}
