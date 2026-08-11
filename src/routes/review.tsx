import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Repeat,
  Target,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useCategoryLookup } from "@/lib/categories";
import { useCategoryName, useT, fmt, useDateLabels } from "@/lib/i18n";
import {
  computeMonthlyReview,
  monthKey,
  parseMonthKey,
  recentMonthKeys,
} from "@/lib/monthly-review";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Monthly Review · NOVA" },
      {
        name: "description",
        content:
          "Your month in numbers: income, expenses, savings rate, budgets, goals and net worth change.",
      },
      { property: "og:title", content: "Monthly Review · NOVA" },
      {
        property: "og:description",
        content: "A concise monthly financial summary built from your NOVA data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tracking-tight",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReviewPage() {
  const { state } = useNova();
  const display = useDisplayState();
  const { format, currency } = useCurrency();
  const categoryOf = useCategoryLookup();
  const catName = useCategoryName();
  const tr = useT();
  const labels = useDateLabels();

  const months = useMemo(() => recentMonthKeys(12), []);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const idx = months.indexOf(month);

  const review = useMemo(
    () =>
      computeMonthlyReview({
        month,
        transactions: display.transactions,
        budgets: display.budgets,
        goals: display.goals,
        subscriptions: display.subscriptions,
        history: state.netWorthHistory ?? [],
        to: currency.code,
      }),
    [month, display, state.netWorthHistory, currency.code],
  );

  const monthLabel = parseMonthKey(month).toLocaleDateString(labels.locale, {
    month: "long",
    year: "numeric",
  });

  const hasData = review.txCount > 0 || review.transferCount > 0;

  return (
    <AppShell>
      <PageHeader subtitle={tr("rev.subtitle")} title={tr("rev.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/70 px-2 py-2 backdrop-blur">
          <button
            aria-label={tr("rev.prevMonth")}
            disabled={idx >= months.length - 1}
            onClick={() => setMonth(months[Math.min(months.length - 1, idx + 1)])}
            className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold capitalize">{monthLabel}</p>
          <button
            aria-label={tr("rev.nextMonth")}
            disabled={idx <= 0}
            onClick={() => setMonth(months[Math.max(0, idx - 1)])}
            className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {!hasData ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<TrendingUp className="h-6 w-6" />}
            title={tr("rev.empty")}
            description={tr("rev.emptyDesc")}
            ctaLabel={tr("rev.addTx")}
            ctaTo="/add"
          />
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 px-5 pt-4">
            <Stat label={tr("rev.income")} value={format(review.income)} tone="up" />
            <Stat label={tr("rev.expenses")} value={format(review.expenses)} tone="down" />
            <Stat
              label={tr("rev.savings")}
              value={format(review.savings)}
              tone={review.savings >= 0 ? "up" : "down"}
            />
            <Stat
              label={tr("rev.savingsRate")}
              value={
                review.savingsRate === null ? tr("rev.na") : `${review.savingsRate.toFixed(0)}%`
              }
              hint={review.savingsRate === null ? tr("rev.noIncome") : undefined}
            />
          </section>

          <section className="px-5 pt-3">
            <Stat
              label={tr("rev.nwChange")}
              value={
                review.netWorthChange === null
                  ? tr("rev.na")
                  : format(review.netWorthChange, { signed: true })
              }
              hint={review.netWorthChange === null ? tr("rev.nwUnavailable") : undefined}
              tone={
                review.netWorthChange === null
                  ? undefined
                  : review.netWorthChange >= 0
                    ? "up"
                    : "down"
              }
            />
          </section>

          <section className="px-5 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <h2 className="text-sm font-semibold">{tr("rev.highlights")}</h2>
              <ul className="mt-3 space-y-3">
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-secondary">
                    <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{tr("rev.topCategory")}</p>
                    <p className="truncate text-sm font-medium">
                      {review.topCategory
                        ? `${catName(categoryOf(review.topCategory.category).id, categoryOf(review.topCategory.category).name)} · ${format(review.topCategory.amount)}`
                        : tr("rev.none")}
                    </p>
                  </div>
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-secondary">
                    <WalletIcon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{tr("rev.largestExpense")}</p>
                    <p className="truncate text-sm font-medium">
                      {review.largestExpense
                        ? `${review.largestExpense.title} · ${format(Math.abs(review.largestExpense.amount))}`
                        : tr("rev.none")}
                    </p>
                  </div>
                </li>
                {review.transferCount > 0 ? (
                  <li className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-secondary">
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">{tr("rev.transfers")}</p>
                      <p className="text-sm font-medium">
                        {fmt(tr("rev.transfersExcluded"), { n: review.transferCount })}
                      </p>
                    </div>
                  </li>
                ) : null}
              </ul>
            </div>
          </section>

          <section className="px-5 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{tr("rev.budgets")}</h2>
              </div>
              {review.budgets.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{tr("rev.noBudgets")}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmt(tr("rev.budgetSummary"), {
                      under: review.budgetsUnder,
                      over: review.budgetsOver,
                    })}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {review.budgets.map((b) => {
                      const cat = categoryOf(b.category);
                      const pct = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
                      return (
                        <li key={b.id}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate">{catName(cat.id, cat.name, cat.builtin)}</span>
                            <span className={cn(b.over ? "text-rose-400" : "text-muted-foreground")}>
                              {format(b.spent)} / {format(b.limit)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: b.over ? "oklch(0.68 0.2 20)" : cat.color,
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </section>

          <section className="px-5 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{tr("rev.goals")}</h2>
              </div>
              {review.goals.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{tr("rev.noGoals")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {review.goals.map((g) => (
                    <li key={g.id}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{g.name}</span>
                        <span className="text-muted-foreground">
                          {format(g.saved)} / {format(g.target)} · {g.pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${g.pct}%`, background: "var(--gradient-primary)" }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="px-5 pb-4 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{tr("rev.subs")}</h2>
                </div>
                <p className="text-sm font-semibold">{format(review.subscriptionTotal)}</p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {review.subscriptionsMatched > 0
                  ? fmt(tr("rev.subsMatched"), { n: review.subscriptionsMatched })
                  : fmt(tr("rev.subsCounted"), { n: review.subscriptionsCounted })}
              </p>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
