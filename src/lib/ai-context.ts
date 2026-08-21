/**
 * NOVA AI architecture — sanitized context + structured actions.
 *
 * The assistant never sees raw state. It sees an `AiSnapshot`: aggregated,
 * rounded numbers plus category ids. Names of people, accounts, transaction
 * descriptions, notes and ids never leave the device through this path, which
 * keeps the same shape usable later for a real model call.
 *
 * Actions are structured (`NovaAction`), not free text, so the UI can render
 * them as real navigation instead of hoping the model wrote a valid link.
 */
import type { FinancialContext } from "@/lib/financial-context";

export type AiSnapshot = {
  /** ISO month the snapshot describes. */
  month: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  liquid: number;
  income: number;
  expenses: number;
  savings: number;
  savingsRatePct: number | null;
  txCount: number;
  /** Category ids only — never transaction titles. */
  topCategories: { category: string; amount: number; prev: number }[];
  budgets: { category: string; limit: number; spent: number; pct: number }[];
  goals: { pct: number; remaining: number }[];
  subscriptions: { count: number; monthly: number };
  debt: { total: number; highestAprPct: number | null };
  runwayMonths: number | null;
  forecast30: {
    endBalance: number;
    lowest: number;
    goesNegative: boolean;
    breachesBuffer: boolean;
    upcomingCount: number;
  };
  /** Optional and off by default: merchant labels are third-party names. */
  merchants?: { label: string; amount: number }[];
};

const round = (n: number) => Math.round(n * 100) / 100;

export function buildAiSnapshot(
  ctx: FinancialContext,
  opts: { includeMerchants?: boolean } = {},
): AiSnapshot {
  return {
    month: ctx.month,
    netWorth: round(ctx.netWorth),
    assets: round(ctx.assets),
    liabilities: round(ctx.liabilities),
    liquid: round(ctx.liquid),
    income: round(ctx.income),
    expenses: round(ctx.expenses),
    savings: round(ctx.savings),
    savingsRatePct: ctx.savingsRate == null ? null : Math.round(ctx.savingsRate),
    txCount: ctx.txCount,
    topCategories: ctx.topCategories.slice(0, 6).map((c) => ({
      category: c.category,
      amount: round(c.amount),
      prev: round(ctx.prevCategories[c.category] ?? 0),
    })),
    budgets: ctx.budgets.map((b) => ({
      category: b.category,
      limit: round(b.limit),
      spent: round(b.spent),
      pct: Math.round(b.pct * 100),
    })),
    goals: ctx.goals.map((g) => ({
      pct: Math.round(g.pct * 100),
      remaining: round(Math.max(0, g.target - g.saved)),
    })),
    subscriptions: { count: ctx.subscriptions.count, monthly: round(ctx.subscriptions.monthly) },
    debt: {
      total: round(ctx.debt.total),
      highestAprPct: ctx.debt.highestApr ? ctx.debt.highestApr.apr : null,
    },
    runwayMonths:
      ctx.runway.essentialRunway ?? ctx.runway.totalRunway == null
        ? ctx.runway.totalRunway == null
          ? null
          : round(ctx.runway.totalRunway)
        : round((ctx.runway.essentialRunway ?? ctx.runway.totalRunway) as number),
    forecast30: {
      endBalance: round(ctx.forecast30.endBalance),
      lowest: round(ctx.forecast30.lowest),
      goesNegative: Boolean(ctx.forecast30.negativeDate),
      breachesBuffer: Boolean(ctx.forecast30.bufferDate),
      upcomingCount: ctx.upcoming.length,
    },
    ...(opts.includeMerchants
      ? { merchants: ctx.topMerchants.slice(0, 5).map((m) => ({ label: m.label, amount: round(m.amount) })) }
      : {}),
  };
}

/** Fields that must never appear in a snapshot, asserted by tests. */
export const FORBIDDEN_SNAPSHOT_KEYS = [
  "accounts",
  "transactions",
  "title",
  "note",
  "name",
  "email",
  "pin",
  "id",
  "accountId",
];

/**
 * Deterministic, language-neutral prompt lines. Kept separate from the UI so a
 * future model call and the local answerer share exactly one description of
 * the user's finances.
 */
export function snapshotLines(s: AiSnapshot): string[] {
  const lines = [
    `month=${s.month}`,
    `net_worth=${s.netWorth} assets=${s.assets} liabilities=${s.liabilities} liquid=${s.liquid}`,
    `income=${s.income} expenses=${s.expenses} savings=${s.savings} savings_rate_pct=${s.savingsRatePct ?? "n/a"}`,
    `transactions=${s.txCount} subscriptions=${s.subscriptions.count} subscription_cost_monthly=${s.subscriptions.monthly}`,
    `forecast30_end=${s.forecast30.endBalance} forecast30_low=${s.forecast30.lowest} negative=${s.forecast30.goesNegative} buffer_breach=${s.forecast30.breachesBuffer}`,
    `runway_months=${s.runwayMonths ?? "n/a"} debt_total=${s.debt.total} debt_top_apr=${s.debt.highestAprPct ?? "n/a"}`,
  ];
  for (const c of s.topCategories) lines.push(`category ${c.category}: now=${c.amount} prev=${c.prev}`);
  for (const b of s.budgets) lines.push(`budget ${b.category}: spent=${b.spent} limit=${b.limit} pct=${b.pct}`);
  return lines;
}

export type NovaActionId =
  | "add_transaction"
  | "open_forecast"
  | "open_budgets"
  | "open_subscriptions"
  | "open_goals"
  | "open_debt"
  | "open_runway"
  | "open_review"
  | "open_notifications";

export type NovaAction = { id: NovaActionId; labelKey: string; route: string };

const ACTIONS: Record<NovaActionId, NovaAction> = {
  add_transaction: { id: "add_transaction", labelKey: "ai.act.add", route: "/add" },
  open_forecast: { id: "open_forecast", labelKey: "ai.act.forecast", route: "/forecast" },
  open_budgets: { id: "open_budgets", labelKey: "ai.act.budgets", route: "/stats" },
  open_subscriptions: { id: "open_subscriptions", labelKey: "ai.act.subs", route: "/subscriptions" },
  open_goals: { id: "open_goals", labelKey: "ai.act.goals", route: "/goals" },
  open_debt: { id: "open_debt", labelKey: "ai.act.debt", route: "/debt" },
  open_runway: { id: "open_runway", labelKey: "ai.act.runway", route: "/runway" },
  open_review: { id: "open_review", labelKey: "ai.act.review", route: "/review" },
  open_notifications: { id: "open_notifications", labelKey: "ai.act.alerts", route: "/notifications" },
};

export function action(id: NovaActionId): NovaAction {
  return ACTIONS[id];
}

/** The most useful next steps for the user's current situation, best first. */
export function suggestActions(ctx: FinancialContext, limit = 3): NovaAction[] {
  const out: NovaActionId[] = [];
  if (ctx.forecast30.negativeDate || ctx.forecast30.bufferDate) out.push("open_forecast");
  if (ctx.budgets.some((b) => b.over || b.near)) out.push("open_budgets");
  if (ctx.debt.highestApr) out.push("open_debt");
  const months = ctx.runway.essentialRunway ?? ctx.runway.totalRunway;
  if (months != null && months < 3) out.push("open_runway");
  if (ctx.subscriptions.count > 0) out.push("open_subscriptions");
  if (ctx.goals.some((g) => g.pct < 1)) out.push("open_goals");
  if (ctx.txCount === 0) out.unshift("add_transaction");
  out.push("open_review");
  return [...new Set(out)].slice(0, limit).map(action);
}
