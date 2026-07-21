import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { categories, categoryOf } from "@/lib/nova-data";
import {
  useNova,
  cashflowByRange,
  filterTxsByRange,
  monthlySpendByCategory,
  useDisplayState,
} from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Range = "week" | "month" | "year";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Statistics · NOVA" },
      { name: "description", content: "Understand your money at a glance." },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { format } = useCurrency();
  const { state } = useNova();
  const display = useDisplayState();
  const [range, setRange] = useState<Range>("month");

  const rangeTx = useMemo(
    () => filterTxsByRange(display.transactions, range),
    [display.transactions, range],
  );
  const cashflow = useMemo(
    () => cashflowByRange(display.transactions, range),
    [display.transactions, range],
  );
  const income = rangeTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = rangeTx.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const net = income - expenses;

  const catSpend = useMemo(
    () => monthlySpendByCategory(display.transactions),
    [display.transactions],
  );
  const catData = categories
    .map((c) => ({ name: c.name, id: c.id, color: c.color, value: catSpend[c.id] ?? 0 }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalCats = catData.reduce((s, c) => s + c.value, 0);

  const trendPct = income > 0 ? Math.round((net / income) * 100) : 0;

  return (
    <AppShell>
      <PageHeader subtitle="Insights" title="Statistics" right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="inline-flex w-full rounded-full border border-border bg-card/60 p-1 text-xs">
          {(["week", "month", "year"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRange(t)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 font-medium capitalize transition-colors",
                range === t ? "text-primary-foreground" : "text-muted-foreground",
              )}
              style={range === t ? { background: "var(--gradient-primary)" } : undefined}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 px-5">
        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Net cashflow
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {format(net, { signed: true })}
              </p>
            </div>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                net >= 0 ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
              )}
            >
              {net >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trendPct >= 0 ? "+" : ""}
              {trendPct}%
            </span>
          </div>
          <div className="mt-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflow} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.18 155)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.18 155)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.19 30)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.7 0.19 30)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="m"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "oklch(0.68 0.02 260)", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="oklch(0.82 0.18 155)"
                  strokeWidth={2}
                  fill="url(#incomeFill)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="oklch(0.7 0.19 30)"
                  strokeWidth={2}
                  fill="url(#expenseFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Income
              <span className="text-foreground">{format(income)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "oklch(0.7 0.19 30)" }}
              />
              Expenses
              <span className="text-foreground">{format(expenses)}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold">Monthly budgets</h2>
        {state.budgets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-5 text-center">
            <p className="text-sm font-semibold">No budgets set</p>
            <p className="mt-1 text-xs text-muted-foreground">Cap a category to get gentle warnings as you spend.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {state.budgets.map((b) => {
              const cat = categoryOf(b.category);
              const spent = catSpend[b.category] ?? 0;
              const pct = Math.min(1.2, spent / b.limit);
              const near = pct >= 0.8 && pct < 1;
              const over = pct >= 1;
              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-border bg-card/70 p-3 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                    >
                      <cat.icon className="h-4 w-4" style={{ color: cat.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between">
                        <p className="truncate text-sm font-semibold">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(spent)} <span className="opacity-60">/ {format(b.limit)}</span>
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${Math.min(100, pct * 100)}%`,
                            background: over
                              ? "linear-gradient(90deg, oklch(0.66 0.24 25), oklch(0.7 0.2 15))"
                              : near
                              ? "linear-gradient(90deg, oklch(0.82 0.17 80), oklch(0.7 0.19 30))"
                              : "var(--gradient-primary)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {near || over ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {over ? "Over budget" : "Nearing limit"}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold">By category</h2>
        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-[var(--shadow-card)]">
          {catData.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">No spending this month.</p>
          ) : (
          <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4">
            <div className="relative h-[140px] w-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={64}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {catData.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Total
                  </p>
                  <p className="text-lg font-semibold">{format(totalCats)}</p>
                </div>
              </div>
            </div>
            <ul className="min-w-0 space-y-2">
              {catData.slice(0, 6).map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
                  <span className="font-medium">{format(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </div>
      </section>

      <section className="mt-6 px-5">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Insight</p>
          <p className="mt-1 text-sm font-medium">
            {net >= 0
              ? `Great work — you're keeping ${format(net)} this ${range}.`
              : `You're spending ${format(-net)} more than you earn this ${range}.`}
          </p>
        </div>
      </section>
    </AppShell>
  );
}