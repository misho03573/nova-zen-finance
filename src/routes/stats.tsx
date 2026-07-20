import { createFileRoute } from "@tanstack/react-router";
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
import { TrendingUp } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { cashflow, spendingByCategory } from "@/lib/nova-data";

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
  const total = spendingByCategory.reduce((s, c) => s + c.value, 0);
  return (
    <AppShell>
      <PageHeader subtitle="Insights" title="Statistics" />

      <section className="px-5">
        <div className="inline-flex w-full rounded-full border border-border bg-card/60 p-1 text-xs">
          {["Week", "Month", "Year"].map((t, i) => (
            <button
              key={t}
              className={
                "flex-1 rounded-full px-3 py-1.5 font-medium " +
                (i === 1 ? "text-primary-foreground" : "text-muted-foreground")
              }
              style={i === 1 ? { background: "var(--gradient-primary)" } : undefined}
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
              <p className="mt-1 text-3xl font-semibold tracking-tight">+$3,325.65</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <TrendingUp className="h-3 w-3" /> +8.2%
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
                    background: "oklch(0.21 0.02 265)",
                    border: "1px solid oklch(1 0 0 / 8%)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "oklch(0.98 0.005 250)" }}
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
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "oklch(0.7 0.19 30)" }}
              />
              Expenses
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold">By category</h2>
        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-4">
            <div className="relative h-[140px] w-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spendingByCategory}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={64}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {spendingByCategory.map((c) => (
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
                  <p className="text-lg font-semibold">${total.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <ul className="min-w-0 space-y-2">
              {spendingByCategory.map((c) => (
                <li key={c.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
                  <span className="font-medium">${c.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Insight</p>
          <p className="mt-1 text-sm font-medium">
            You spent 18% less on dining this month. Nice.
          </p>
        </div>
      </section>
    </AppShell>
  );
}