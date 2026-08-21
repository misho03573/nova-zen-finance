/**
 * Smart Notifications Center.
 *
 * Notifications are *derived*, never stored as events: every render rebuilds
 * them from the current `FinancialContext`, so a resolved condition disappears
 * on its own. Only two things persist — the ids the user has read and the
 * per-category preferences.
 *
 * Ids are deterministic and period-scoped (e.g. `budget-over|food|2026-08`) so
 * that "read" survives reloads but a NEW month re-notifies.
 */
import type { FinancialContext, UpcomingItem } from "@/lib/financial-context";
import { buildIntelligence } from "@/lib/intelligence";

export const NOTIFICATION_CATEGORIES = [
  "bills",
  "budgets",
  "goals",
  "forecast",
  "insights",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPrefs = Partial<Record<NotificationCategory, boolean>>;

export type NovaNotification = {
  id: string;
  category: NotificationCategory;
  severity: "info" | "warn" | "critical" | "good";
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  money: string[];
  route?: string;
  /** ISO date the notification relates to (due date, month start, ...). */
  date: string;
  weight: number;
};

/** How many days ahead a bill/subscription starts notifying. */
export const BILL_LEAD_DAYS = 5;

export function isEnabled(prefs: NotificationPrefs | undefined, c: NotificationCategory): boolean {
  return prefs?.[c] !== false;
}

function billId(item: UpcomingItem) {
  return `bill|${item.id}|${item.date.slice(0, 10)}`;
}

export function buildNotifications(args: {
  ctx: FinancialContext;
  prefs?: NotificationPrefs;
  /** Master switch from Settings. */
  enabled?: boolean;
}): NovaNotification[] {
  const { ctx } = args;
  if (args.enabled === false) return [];
  const prefs = args.prefs;
  const out: NovaNotification[] = [];
  const month = ctx.month;

  // — Bills & subscriptions due soon.
  if (isEnabled(prefs, "bills")) {
    for (const item of ctx.upcoming) {
      if (item.amount >= 0) continue;
      if (item.days > BILL_LEAD_DAYS) continue;
      out.push({
        id: billId(item),
        category: "bills",
        severity: item.days <= 1 ? "warn" : "info",
        titleKey: item.days === 0 ? "ntf.billToday.title" : "ntf.billSoon.title",
        bodyKey: "ntf.billSoon.body",
        params: { name: item.title, days: item.days, amount: Math.abs(item.amount) },
        money: ["amount"],
        route: item.kind === "subscription" ? "/subscriptions" : "/automation",
        date: item.date,
        weight: 400 - item.days,
      });
    }
  }

  // — Budgets, scoped to the current month.
  if (isEnabled(prefs, "budgets")) {
    for (const b of ctx.budgets) {
      if (b.over) {
        out.push({
          id: `budget-over|${b.id}|${month}`,
          category: "budgets",
          severity: "warn",
          titleKey: "ntf.budgetOver.title",
          bodyKey: "ntf.budgetOver.body",
          params: { category: b.category, amount: b.spent - b.limit, limit: b.limit },
          money: ["amount", "limit"],
          route: "/stats",
          date: new Date(ctx.now).toISOString(),
          weight: 350,
        });
      } else if (b.near) {
        out.push({
          id: `budget-near|${b.id}|${month}`,
          category: "budgets",
          severity: "info",
          titleKey: "ntf.budgetNear.title",
          bodyKey: "ntf.budgetNear.body",
          params: { category: b.category, pct: Math.round(b.pct * 100), amount: b.limit - b.spent },
          money: ["amount"],
          route: "/stats",
          date: new Date(ctx.now).toISOString(),
          weight: 250,
        });
      }
    }
  }

  // — Forecast risk.
  if (isEnabled(prefs, "forecast")) {
    if (ctx.forecast30.negativeDate) {
      out.push({
        id: `forecast-negative|${ctx.forecast30.negativeDate.slice(0, 10)}`,
        category: "forecast",
        severity: "critical",
        titleKey: "ntf.forecastNeg.title",
        bodyKey: "ntf.forecastNeg.body",
        params: {
          date: ctx.forecast30.negativeDate.slice(0, 10),
          amount: ctx.forecast30.lowest,
        },
        money: ["amount"],
        route: "/forecast",
        date: ctx.forecast30.negativeDate,
        weight: 500,
      });
    } else if (ctx.forecast30.bufferDate && ctx.buffer > 0) {
      out.push({
        id: `forecast-buffer|${ctx.forecast30.bufferDate.slice(0, 10)}`,
        category: "forecast",
        severity: "warn",
        titleKey: "ntf.forecastBuffer.title",
        bodyKey: "ntf.forecastBuffer.body",
        params: { date: ctx.forecast30.bufferDate.slice(0, 10), amount: ctx.buffer },
        money: ["amount"],
        route: "/forecast",
        date: ctx.forecast30.bufferDate,
        weight: 300,
      });
    }
  }

  // — Goals reached or nearly reached.
  if (isEnabled(prefs, "goals")) {
    for (const g of ctx.goals) {
      if (g.target <= 0) continue;
      if (g.saved >= g.target) {
        out.push({
          id: `goal-done|${g.id}`,
          category: "goals",
          severity: "good",
          titleKey: "ntf.goalDone.title",
          bodyKey: "ntf.goalDone.body",
          params: { name: g.name, amount: g.target },
          money: ["amount"],
          route: "/goals",
          date: new Date(ctx.now).toISOString(),
          weight: 280,
        });
      } else if (g.pct >= 0.9) {
        out.push({
          id: `goal-close|${g.id}|${month}`,
          category: "goals",
          severity: "info",
          titleKey: "ntf.goalClose.title",
          bodyKey: "ntf.goalClose.body",
          params: { name: g.name, amount: g.target - g.saved, pct: Math.round(g.pct * 100) },
          money: ["amount"],
          route: "/goals",
          date: new Date(ctx.now).toISOString(),
          weight: 200,
        });
      }
    }
  }

  // — Top intelligence findings, surfaced as notifications once per month.
  if (isEnabled(prefs, "insights")) {
    const strong = buildIntelligence(ctx)
      .filter((i) => i.severity === "critical" || i.severity === "warn")
      .filter((i) => i.kind !== "budget" && i.kind !== "forecast")
      .slice(0, 3);
    for (const i of strong) {
      out.push({
        id: `insight|${i.id}|${month}`,
        category: "insights",
        severity: i.severity,
        titleKey: i.titleKey,
        bodyKey: i.bodyKey,
        params: i.params,
        money: i.money,
        route: i.route,
        date: new Date(ctx.now).toISOString(),
        weight: 150,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight || (a.date < b.date ? -1 : 1));
}

export function unreadCount(list: NovaNotification[], read: string[] | undefined): number {
  const set = new Set(read ?? []);
  return list.filter((n) => !set.has(n.id)).length;
}
