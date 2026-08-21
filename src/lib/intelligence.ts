/**
 * Financial Intelligence Layer — deterministic, explainable insights.
 *
 * Every insight is derived from `FinancialContext` with plain arithmetic: no
 * model calls, no randomness, and the same input always yields the same
 * output. Strings are emitted as i18n keys plus params so the UI stays fully
 * localized; `money` names the params that must be rendered as currency.
 */
import type { FinancialContext } from "@/lib/financial-context";

export type InsightSeverity = "good" | "info" | "warn" | "critical";

export type SmartInsight = {
  /** Stable across renders and days so dismissals/reads can key off it. */
  id: string;
  kind: string;
  severity: InsightSeverity;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  /** Param names holding currency amounts. */
  money: string[];
  route?: string;
  /** Higher sorts first. */
  weight: number;
};

const SEV_WEIGHT: Record<InsightSeverity, number> = {
  critical: 300,
  warn: 200,
  good: 120,
  info: 100,
};

function pctChange(current: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((current - prev) / prev) * 100;
}

/** Categories must matter in absolute terms before a % change is worth showing. */
const MIN_CATEGORY_AMOUNT = 25;
const SPIKE_PCT = 25;

export function buildIntelligence(ctx: FinancialContext): SmartInsight[] {
  const out: SmartInsight[] = [];
  const push = (i: SmartInsight) => out.push(i);

  // — Cash flow: negative or buffer-breaching projection is the loudest signal.
  if (ctx.forecast30.negativeDate) {
    push({
      id: "fc-negative",
      kind: "forecast",
      severity: "critical",
      titleKey: "fi.negative.title",
      bodyKey: "fi.negative.body",
      params: { date: ctx.forecast30.negativeDate.slice(0, 10), amount: ctx.forecast30.lowest },
      money: ["amount"],
      route: "/forecast",
      weight: SEV_WEIGHT.critical + 50,
    });
  } else if (ctx.forecast30.bufferDate && ctx.buffer > 0) {
    push({
      id: "fc-buffer",
      kind: "forecast",
      severity: "warn",
      titleKey: "fi.buffer.title",
      bodyKey: "fi.buffer.body",
      params: { date: ctx.forecast30.bufferDate.slice(0, 10), amount: ctx.buffer },
      money: ["amount"],
      route: "/forecast",
      weight: SEV_WEIGHT.warn + 40,
    });
  }

  // — Budgets.
  for (const b of ctx.budgets) {
    if (b.over) {
      push({
        id: `budget-over-${b.id}`,
        kind: "budget",
        severity: "warn",
        titleKey: "fi.budgetOver.title",
        bodyKey: "fi.budgetOver.body",
        params: {
          category: b.category,
          amount: b.spent - b.limit,
          limit: b.limit,
          pct: Math.round(b.pct * 100),
        },
        money: ["amount", "limit"],
        route: "/stats",
        weight: SEV_WEIGHT.warn + Math.min(30, Math.round((b.pct - 1) * 100)),
      });
    } else if (b.near) {
      push({
        id: `budget-near-${b.id}`,
        kind: "budget",
        severity: "info",
        titleKey: "fi.budgetNear.title",
        bodyKey: "fi.budgetNear.body",
        params: {
          category: b.category,
          pct: Math.round(b.pct * 100),
          amount: b.limit - b.spent,
        },
        money: ["amount"],
        route: "/stats",
        weight: SEV_WEIGHT.info + 20,
      });
    }
  }

  // — Category spending changes vs last month.
  for (const c of ctx.topCategories.slice(0, 6)) {
    const prev = ctx.prevCategories[c.category] ?? 0;
    if (c.amount < MIN_CATEGORY_AMOUNT || prev < MIN_CATEGORY_AMOUNT) continue;
    const change = pctChange(c.amount, prev);
    if (change == null) continue;
    if (change >= SPIKE_PCT) {
      push({
        id: `cat-up-${c.category}`,
        kind: "spending",
        severity: "info",
        titleKey: "fi.catUp.title",
        bodyKey: "fi.catUp.body",
        params: {
          category: c.category,
          pct: Math.round(change),
          amount: c.amount,
          prev,
        },
        money: ["amount", "prev"],
        route: "/stats",
        weight: SEV_WEIGHT.info + Math.min(40, Math.round(change / 2)),
      });
    } else if (change <= -SPIKE_PCT) {
      push({
        id: `cat-down-${c.category}`,
        kind: "spending",
        severity: "good",
        titleKey: "fi.catDown.title",
        bodyKey: "fi.catDown.body",
        params: {
          category: c.category,
          pct: Math.abs(Math.round(change)),
          amount: prev - c.amount,
        },
        money: ["amount"],
        route: "/stats",
        weight: SEV_WEIGHT.good,
      });
    }
  }

  // — Savings rate.
  if (ctx.savingsRate != null) {
    if (ctx.savingsRate < 0) {
      push({
        id: "savings-negative",
        kind: "savings",
        severity: "warn",
        titleKey: "fi.savingsNeg.title",
        bodyKey: "fi.savingsNeg.body",
        params: { amount: Math.abs(ctx.savings) },
        money: ["amount"],
        route: "/review",
        weight: SEV_WEIGHT.warn + 10,
      });
    } else if (ctx.savingsRate >= 20) {
      push({
        id: "savings-strong",
        kind: "savings",
        severity: "good",
        titleKey: "fi.savingsGood.title",
        bodyKey: "fi.savingsGood.body",
        params: { pct: Math.round(ctx.savingsRate), amount: ctx.savings },
        money: ["amount"],
        route: "/review",
        weight: SEV_WEIGHT.good,
      });
    }
  }

  // — Emergency runway.
  const months = ctx.runway.essentialRunway ?? ctx.runway.totalRunway;
  if (months != null && months < 3) {
    push({
      id: "runway-low",
      kind: "runway",
      severity: months < 1 ? "critical" : "warn",
      titleKey: "fi.runwayLow.title",
      bodyKey: "fi.runwayLow.body",
      params: { months: months.toFixed(1), amount: ctx.runway.remaining ?? 0 },
      money: ["amount"],
      route: "/runway",
      weight: (months < 1 ? SEV_WEIGHT.critical : SEV_WEIGHT.warn) + 5,
    });
  }

  // — Interest: paying off the highest-APR debt is the best guaranteed return.
  if (ctx.debt.highestApr && ctx.debt.total > 0) {
    const yearly = (ctx.debt.total * ctx.debt.highestApr.apr) / 100;
    if (yearly > 0) {
      push({
        id: "debt-interest",
        kind: "debt",
        severity: "info",
        titleKey: "fi.interest.title",
        bodyKey: "fi.interest.body",
        params: {
          name: ctx.debt.highestApr.name,
          apr: ctx.debt.highestApr.apr,
          amount: yearly,
        },
        money: ["amount"],
        route: "/debt",
        weight: SEV_WEIGHT.info + 30,
      });
    }
  }

  // — Subscription load relative to real spending.
  if (ctx.subscriptions.count > 0 && ctx.expenses > 0) {
    const share = (ctx.subscriptions.monthly / ctx.expenses) * 100;
    if (share >= 15) {
      push({
        id: "subs-share",
        kind: "subscriptions",
        severity: "info",
        titleKey: "fi.subsShare.title",
        bodyKey: "fi.subsShare.body",
        params: {
          pct: Math.round(share),
          amount: ctx.subscriptions.monthly,
          n: ctx.subscriptions.count,
        },
        money: ["amount"],
        route: "/subscriptions",
        weight: SEV_WEIGHT.info + 10,
      });
    }
  }

  // — Goal momentum.
  const nearGoal = ctx.goals
    .filter((g) => g.pct >= 0.8 && g.pct < 1)
    .sort((a, b) => b.pct - a.pct)[0];
  if (nearGoal) {
    push({
      id: `goal-near-${nearGoal.id}`,
      kind: "goal",
      severity: "good",
      titleKey: "fi.goalNear.title",
      bodyKey: "fi.goalNear.body",
      params: {
        name: nearGoal.name,
        pct: Math.round(nearGoal.pct * 100),
        amount: nearGoal.target - nearGoal.saved,
      },
      money: ["amount"],
      route: "/goals",
      weight: SEV_WEIGHT.good + 5,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
