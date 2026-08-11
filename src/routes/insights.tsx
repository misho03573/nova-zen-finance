import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Search,
  Trophy,
  Bell,
  Wand2,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { AnimatedNumber } from "@/components/nova/AnimatedNumber";
import {
  useNova,
  totalBalance,
  formatTxDate,
  useDisplayState,
} from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useCategoryLookup } from "@/lib/categories";
import { useCategoryName, useT, fmt, useDateLabels } from "@/lib/i18n";
import {
  generateInsights,
  cashflowForecast,
  computeAchievements,
  computeAlerts,
  recommendBudget,
  parseSearchQuery,
} from "@/lib/insights";
import { financialScore } from "@/lib/nova-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights · NOVA" },
      {
        name: "description",
        content: "AI-powered financial insights, cash-flow forecasts and achievements.",
      },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const { state, setBudget } = useNova();
  const { format, currency } = useCurrency();
  const display = useDisplayState();
  const categoryOf = useCategoryLookup();
  const catName = useCategoryName();
  const tr = useT();
  const dateLabels = useDateLabels();
  const [query, setQuery] = useState("");

  const insights = useMemo(
    () => generateInsights(state.transactions, state.goals),
    [state.transactions, state.goals],
  );
  const forecast = useMemo(
    () => cashflowForecast(state.transactions, state.recurring, totalBalance(state.accounts)),
    [state.transactions, state.recurring, state.accounts],
  );
  const achievements = useMemo(
    () => computeAchievements(state.transactions, state.goals, financialScore / 10),
    [state.transactions, state.goals],
  );
  const alerts = useMemo(
    () => computeAlerts(display.recurring, display.budgets, display.transactions),
    [display.recurring, display.budgets, display.transactions],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const match = parseSearchQuery(query);
    return state.transactions.filter(match).slice(0, 8);
  }, [query, state.transactions]);

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("ins.subtitle")}
        title={tr("ins.title")}
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker />
            <Link
              to="/calendar"
              aria-label={tr("shell.calendar")}
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="px-5 pb-3">
        <Link
          to="/review"
          className="press flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{tr("rev.open")}</span>
            <span className="block truncate text-xs text-muted-foreground">{tr("rev.openDesc")}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>

      <section className="px-5">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3 py-2.5 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("ins.searchPlaceholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {tr("ins.clear")}
            </button>
          ) : null}
        </div>
        {query ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card/70">
            {searchResults.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{tr("ins.noMatches")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {searchResults.map((t) => {
                  const cat = categoryOf(t.category);
                  const Icon = cat.icon;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div
                        className="grid h-8 w-8 place-items-center rounded-xl"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)`,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {formatTxDate(t.date, dateLabels)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          t.amount > 0 ? "text-primary" : "text-foreground",
                        )}
                      >
                        {format(t.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-6 px-5">
        <ForecastCard forecast={forecast} />
      </section>

      {alerts.length ? (
        <section className="mt-6 px-5">
          <SectionTitle icon={<Bell className="h-3.5 w-3.5" />}>{tr("ins.alerts")}</SectionTitle>
          <ul className="mt-2 space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur",
                  a.tone === "warning"
                    ? "border-destructive/40 bg-destructive/10"
                    : a.tone === "positive"
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card/70",
                )}
              >
                <span className="text-lg">{a.icon}</span>
                <p className="flex-1 text-sm">{a.title}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 px-5">
        <SectionTitle icon={<Sparkles className="h-3.5 w-3.5" />}>{tr("ins.aiInsights")}</SectionTitle>
        {insights.length === 0 ? (
          <div className="mt-2 rounded-3xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            {tr("ins.aiEmpty")}
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {insights.map((i, idx) => (
              <li
                key={i.id}
                className="animate-fade-in rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-lg",
                      i.tone === "positive"
                        ? "bg-primary/15"
                        : i.tone === "warning"
                        ? "bg-destructive/15"
                        : "bg-muted",
                    )}
                  >
                    {i.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{i.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 px-5">
        <SectionTitle icon={<Wand2 className="h-3.5 w-3.5" />}>{tr("ins.smartBudgets")}</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {tr("ins.smartBudgetsDesc")}
        </p>
        <ul className="mt-3 space-y-2">
          {display.budgets.map((b) => {
            const cat = categoryOf(b.category);
            const rec = recommendBudget(display.transactions, b.category);
            const limitDisp = b.limit;
            const Icon = cat.icon;
            return (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-3 py-2.5"
              >
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl"
                  style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color: cat.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{catName(cat.id, cat.name, cat.builtin)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {fmt(tr("ins.currentSuggested"), { cur: format(limitDisp), sug: rec ? format(rec) : "—" })}
                  </p>
                </div>
                {rec > 0 && Math.abs(rec - limitDisp) > 0.5 ? (
                  <button
                    onClick={() => setBudget(b.category, rec, currency.code)}
                    className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/25"
                  >
                    {tr("ins.apply")}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{tr("ins.onTarget")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 px-5">
        <SectionTitle icon={<Trophy className="h-3.5 w-3.5" />}>{tr("ins.achievements")}</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-2xl border p-3 transition-all",
                a.unlocked
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card/50 opacity-70",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{a.icon}</span>
                <p className="truncate text-xs font-semibold">{a.title}</p>
              </div>
              {a.hint ? (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{a.hint}</p>
              ) : null}
              {a.progress !== undefined && !a.unlocked ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.round(a.progress * 100)}%`,
                      background: "var(--gradient-primary)",
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-5">
        <Link
          to="/stats"
          className="flex items-center justify-between rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-card"
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {tr("ins.deepDive")}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>
    </AppShell>
  );
}

function SectionTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {icon ? <span className="text-primary">{icon}</span> : null}
      {children}
    </h2>
  );
}

function ForecastCard({
  forecast,
}: {
  forecast: { today: number; points: { label: string; days: number; value: number; confidence: number }[] };
}) {
  const { format, currency } = useCurrency();
  const display = useDisplayState();
  const tr = useT();
  const values = [forecast.today, ...forecast.points.map((p) => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const w = 300;
  const h = 90;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {tr("ins.forecast")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{tr("ins.balanceToday")}</p>
          <AnimatedNumber
            value={forecast.today}
            format={(n) => format(n)}
            className="mt-0.5 block text-3xl font-semibold tracking-tight"
          />
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-primary">
          AI
        </span>
      </div>
      <div className="mt-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
          <defs>
            <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.82 0.18 155)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="oklch(0.82 0.18 155)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${h} ${pts.join(" ")} ${w},${h}`}
            fill="url(#fc)"
          />
          <polyline
            points={pts.join(" ")}
            fill="none"
            stroke="url(#novaScore)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="novaScore" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="oklch(0.82 0.18 155)" />
              <stop offset="100%" stopColor="oklch(0.75 0.15 200)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {forecast.points.map((p) => (
          <div
            key={p.days}
            className="rounded-2xl border border-border bg-card/60 p-2.5 backdrop-blur"
          >
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {fmt(tr("ins.inLabel"), { label: p.label })}
            </p>
            <p
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                p.value >= forecast.today ? "text-primary" : "text-foreground",
              )}
            >
              {format(p.value)}
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(p.confidence * 100)}%`,
                    background: "var(--gradient-primary)",
                  }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {Math.round(p.confidence * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}