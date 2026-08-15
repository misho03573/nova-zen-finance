import type { Transaction, Recurring, Goal, Budget } from "./nova-store";
import { categoryOf } from "./nova-data";

export type Insight = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
};

function inMonthOffset(d: Date, offset: number) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
}

/** Reconciliation records never count as income, expense or spending. */
function real(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => t.kind !== "adjustment");
}

function spendByCategory(all: Transaction[], offset = 0) {
  const txs = real(all);
  const map: Record<string, number> = {};
  for (const t of txs) {
    const d = new Date(t.date);
    if (inMonthOffset(d, offset) && t.amount < 0) {
      map[t.category] = (map[t.category] ?? 0) + -t.amount;
    }
  }
  return map;
}

function monthTotals(all: Transaction[], offset: number) {
  const txs = real(all);
  let income = 0;
  let expenses = 0;
  for (const t of txs) {
    const d = new Date(t.date);
    if (inMonthOffset(d, offset)) {
      if (t.amount > 0) income += t.amount;
      else expenses += -t.amount;
    }
  }
  return { income, expenses };
}

function catName(id: string) {
  return categoryOf(id).name;
}

export function generateInsights(txs: Transaction[], goals: Goal[]): Insight[] {
  const cur = spendByCategory(txs, 0);
  const prev = spendByCategory(txs, -1);
  const insights: Insight[] = [];
  const cats = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  const deltas: { cat: string; pct: number }[] = [];
  for (const cat of cats) {
    const c = cur[cat] ?? 0;
    const p = prev[cat] ?? 0;
    if (p === 0 && c === 0) continue;
    const pct = p === 0 ? 1 : (c - p) / p;
    deltas.push({ cat, pct });
  }
  deltas.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  for (const d of deltas.slice(0, 3)) {
    if (d.pct <= -0.05) {
      insights.push({
        id: `dn-${d.cat}`,
        icon: "📉",
        title: `You spent ${Math.round(Math.abs(d.pct) * 100)}% less on ${catName(d.cat)} this month`,
        detail: "Nice — keep the momentum going.",
        tone: "positive",
      });
    } else if (d.pct >= 0.15) {
      insights.push({
        id: `up-${d.cat}`,
        icon: "📈",
        title: `${catName(d.cat)} expenses increased by ${Math.round(d.pct * 100)}%`,
        detail: "Worth a quick check.",
        tone: "warning",
      });
    }
  }
  const biggest = Object.entries(cur).sort((a, b) => b[1] - a[1])[0];
  if (biggest) {
    insights.push({
      id: "biggest",
      icon: "🏷️",
      title: `Your biggest expense category is ${catName(biggest[0])}`,
      detail: `${biggest[1].toFixed(0)} spent this month.`,
      tone: "neutral",
    });
  }
  const curT = monthTotals(txs, 0);
  const prevT = monthTotals(txs, -1);
  const curRate = curT.income > 0 ? (curT.income - curT.expenses) / curT.income : 0;
  const prevRate = prevT.income > 0 ? (prevT.income - prevT.expenses) / prevT.income : 0;
  if (curRate - prevRate >= 0.02) {
    insights.push({
      id: "sr-up",
      icon: "🎯",
      title: `Your savings rate improved by ${Math.round((curRate - prevRate) * 100)}%`,
      detail: "You're keeping more of what you earn.",
      tone: "positive",
    });
  }
  const net = curT.income - curT.expenses;
  if (net > 0) {
    insights.push({
      id: "yearly",
      icon: "✨",
      title: `If you continue this pace you'll save ${Math.round(net * 12).toLocaleString()} this year`,
      detail: "Projection based on current month activity.",
      tone: "positive",
    });
  }
  const close = goals.find((g) => g.saved / g.target >= 0.75 && g.saved < g.target);
  if (close) {
    insights.push({
      id: `goal-${close.id}`,
      icon: close.emoji,
      title: `You're ${Math.round((close.saved / close.target) * 100)}% toward ${close.name}`,
      detail: "Almost there — consider a top-up.",
      tone: "positive",
    });
  }
  return insights;
}

export type ForecastPoint = { label: string; days: number; value: number; confidence: number };

export function cashflowForecast(
  allTxs: Transaction[],
  recurring: Recurring[],
  startBalance: number,
): { today: number; points: ForecastPoint[] } {
  const txs = real(allTxs);
  const now = Date.now();
  const day = 86400000;
  const thirty = now - 30 * day;
  let net30 = 0;
  for (const t of txs) {
    const ts = +new Date(t.date);
    if (ts >= thirty && ts <= now) net30 += t.amount;
  }
  const dailyNet = net30 / 30;
  const recDaily = recurring.reduce((s, r) => {
    const period = r.frequency === "weekly" ? 7 : r.frequency === "monthly" ? 30 : 365;
    return s + r.amount / period;
  }, 0);
  const baselinePerDay = dailyNet - recDaily;
  const horizons: { label: string; days: number }[] = [
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
  ];
  const points = horizons.map(({ label, days }) => {
    const windowEnd = now + days * day;
    let recSum = 0;
    for (const r of recurring) {
      let d = +new Date(r.nextDate);
      while (d <= windowEnd) {
        recSum += r.amount;
        if (r.frequency === "weekly") d += 7 * day;
        else if (r.frequency === "monthly") d += 30 * day;
        else d += 365 * day;
      }
    }
    const value = startBalance + baselinePerDay * days + recSum;
    const confidence = Math.max(0.55, 1 - days / 180);
    return { label, days, value, confidence };
  });
  return { today: startBalance, points };
}

export function recommendBudget(allTxs: Transaction[], category: string): number {
  const txs = real(allTxs);
  const now = new Date();
  const totals: number[] = [];
  for (let i = 0; i < 6; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    let sum = 0;
    for (const t of txs) {
      const d = new Date(t.date);
      if (d >= start && d < end && t.amount < 0 && t.category === category) sum += -t.amount;
    }
    totals.push(sum);
  }
  const nonZero = totals.filter((x) => x > 0);
  if (!nonZero.length) return 0;
  const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  return Math.max(10, Math.round(avg / 10) * 10);
}

export type Achievement = {
  id: string;
  icon: string;
  title: string;
  hint?: string;
  unlocked: boolean;
  progress?: number;
};

export function computeAchievements(
  allTxs: Transaction[],
  goals: Goal[],
  score: number,
): Achievement[] {
  const txs = real(allTxs);
  const distinctDays = new Set(txs.map((t) => new Date(t.date).toDateString())).size;
  const anyGoalDone = goals.some((g) => g.saved >= g.target);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totals = monthTotals(txs, 0);
  const rate = totals.income > 0 ? (totals.income - totals.expenses) / totals.income : 0;
  const week = Date.now() - 7 * 86400000;
  const anyFun = txs.some(
    (t) =>
      +new Date(t.date) >= week &&
      (t.category === "shopping" || t.category === "entertainment") &&
      t.amount < 0,
  );
  return [
    {
      id: "streak",
      icon: "🔥",
      title: "30 Days Tracking",
      hint: `${Math.min(30, distinctDays)}/30 days`,
      unlocked: distinctDays >= 30,
      progress: Math.min(1, distinctDays / 30),
    },
    {
      id: "saved1k",
      icon: "💰",
      title: "Saved 1,000",
      hint: `${totalSaved.toFixed(0)} saved`,
      unlocked: totalSaved >= 1000,
      progress: Math.min(1, totalSaved / 1000),
    },
    {
      id: "clean7",
      icon: "🚫",
      title: "No fun spending — 7d",
      unlocked: !anyFun,
    },
    { id: "goal1", icon: "🎯", title: "First Goal Completed", unlocked: anyGoalDone },
    { id: "score90", icon: "🏆", title: "Financial Score 90+", unlocked: score >= 90 },
    {
      id: "rate20",
      icon: "📈",
      title: "Save 20% this month",
      hint: `${Math.round(rate * 100)}% saved`,
      unlocked: rate >= 0.2,
      progress: Math.min(1, rate / 0.2),
    },
  ];
}

export type Alert = {
  id: string;
  icon: string;
  title: string;
  tone: "info" | "warning" | "positive";
};

export function computeAlerts(
  recurring: Recurring[],
  budgets: Budget[],
  txs: Transaction[],
): Alert[] {
  const alerts: Alert[] = [];
  const day = 86400000;
  const tomorrow = Date.now() + day;
  const in3 = Date.now() + 3 * day;
  for (const r of recurring) {
    const t = +new Date(r.nextDate);
    if (t > Date.now() && t <= tomorrow) {
      alerts.push({
        id: `r-${r.id}`,
        icon: "⏰",
        title: `${r.title} payment due tomorrow`,
        tone: "warning",
      });
    } else if (t > Date.now() && t <= in3) {
      alerts.push({
        id: `r-${r.id}`,
        icon: "📅",
        title: `${r.title} coming up in a few days`,
        tone: "info",
      });
    }
  }
  const spent = spendByCategory(txs, 0);
  for (const b of budgets) {
    const s = spent[b.category] ?? 0;
    if (s >= b.limit && b.limit > 0) {
      alerts.push({
        id: `b-${b.category}`,
        icon: "🚨",
        title: `You've exceeded your ${catName(b.category)} budget`,
        tone: "warning",
      });
    } else if (b.limit > 0 && s >= b.limit * 0.8) {
      alerts.push({
        id: `b-${b.category}`,
        icon: "⚠️",
        title: `You are close to exceeding your ${catName(b.category)} budget`,
        tone: "warning",
      });
    }
  }
  const totals = monthTotals(txs, 0);
  const rate = totals.income > 0 ? (totals.income - totals.expenses) / totals.income : 0;
  if (rate >= 0.2) {
    alerts.push({
      id: "sr20",
      icon: "🎉",
      title: `You have saved ${Math.round(rate * 100)}% this month`,
      tone: "positive",
    });
  }
  return alerts;
}

export function parseSearchQuery(q: string): (t: Transaction) => boolean {
  const s = q.trim().toLowerCase();
  if (!s) return () => true;
  const over = s.match(/(?:over|above|>)\s*(\d+(?:\.\d+)?)/);
  const under = s.match(/(?:under|below|<)\s*(\d+(?:\.\d+)?)/);
  const lastMonth = /last month/.test(s);
  const thisMonth = /this month/.test(s);
  const thisWeek = /(this week|last 7 days|past week)/.test(s);
  const free = s
    .replace(/(?:over|above|>|under|below|<)\s*\d+(?:\.\d+)?/g, "")
    .replace(/last month|this month|this week|last 7 days|past week/g, "")
    .trim();
  return (t: Transaction) => {
    const abs = Math.abs(t.amount);
    if (over && abs < parseFloat(over[1])) return false;
    if (under && abs > parseFloat(under[1])) return false;
    const d = new Date(t.date);
    const now = new Date();
    if (thisMonth && !(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()))
      return false;
    if (lastMonth) {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      if (!(d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth())) return false;
    }
    if (thisWeek && Date.now() - +d > 7 * 86400000) return false;
    if (free) {
      const hay = `${t.title} ${t.category} ${t.note ?? ""}`.toLowerCase();
      if (!free.split(/\s+/).every((tok) => hay.includes(tok))) return false;
    }
    return true;
  };
}