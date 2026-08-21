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
import { TrendingUp, TrendingDown, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useCategories, useCategoryLookup } from "@/lib/categories";
import { useCategoryName, useT, fmt, useLocale } from "@/lib/i18n";
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
  const { format, currency } = useCurrency();
  const { state, setBudget, deleteBudget } = useNova();
  const display = useDisplayState();
  const [range, setRange] = useState<Range>("month");
  const categoryOf = useCategoryLookup();
  const categories = useCategories();
  const catName = useCategoryName();
  const tr = useT();
  const locale = useLocale();
  const confirm = useConfirm();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetCat, setBudgetCat] = useState<string>("");
  const [budgetLimit, setBudgetLimit] = useState("");

  const openBudget = (category?: string, limit?: number) => {
    setBudgetCat(category ?? categories[0]?.id ?? "");
    setBudgetLimit(limit != null ? limit.toFixed(2) : "");
    setBudgetOpen(true);
  };

  const saveBudget = () => {
    const value = Number(budgetLimit);
    if (!budgetCat || !Number.isFinite(value) || value <= 0) {
      toast.error(tr("stats.budget.invalid"));
      return;
    }
    // Stored in the currency it was entered in; converted once for display.
    setBudget(budgetCat, value, currency.code);
    setBudgetOpen(false);
    toast.success(tr("stats.budget.saved"));
  };

  const removeBudget = async (id: string) => {
    const ok = await confirm({
      title: tr("stats.budget.deleteTitle"),
      description: tr("stats.budget.deleteDesc"),
      confirmLabel: tr("common.delete"),
      cancelLabel: tr("action.cancel"),
      destructive: true,
    });
    if (ok) deleteBudget(id);
  };

  const rangeTx = useMemo(
    () => filterTxsByRange(display.transactions, range),
    [display.transactions, range],
  );
  const cashflow = useMemo(
    () => cashflowByRange(display.transactions, range, locale),
    [display.transactions, range, locale],
  );
  const income = rangeTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = rangeTx.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const net = income - expenses;

  const catSpend = useMemo(
    () => monthlySpendByCategory(display.transactions),
    [display.transactions],
  );
  const catData = categories
    .map((c) => ({ name: catName(c.id, c.name, c.builtin), id: c.id, color: c.color, value: catSpend[c.id] ?? 0 }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalCats = catData.reduce((s, c) => s + c.value, 0);

  const trendPct = income > 0 ? Math.round((net / income) * 100) : 0;

  return (
    <AppShell>
      <PageHeader back subtitle={tr("stats.subtitle")} title={tr("stats.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="inline-flex w-full rounded-full border border-border bg-card/60 p-1 text-xs">
          {(["week", "month", "year"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 font-medium capitalize transition-colors",
                range === r ? "text-primary-foreground" : "text-muted-foreground",
              )}
              style={range === r ? { background: "var(--gradient-primary)" } : undefined}
            >
              {tr(`stats.${r}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 px-5">
        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {tr("stats.netCashflow")}
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
              <span className="h-2 w-2 rounded-full bg-primary" /> {tr("stats.income")}
              <span className="text-foreground">{format(income)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "oklch(0.7 0.19 30)" }}
              />
              {tr("stats.expenses")}
              <span className="text-foreground">{format(expenses)}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{tr("stats.monthlyBudgets")}</h2>
          <button
            onClick={() => openBudget()}
            className="flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium"
          >
            <Plus className="h-3 w-3" />
            {tr("stats.budget.add")}
          </button>
        </div>
        {display.budgets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-5 text-center">
            <p className="text-sm font-semibold">{tr("stats.noBudgets")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tr("stats.noBudgetsDesc")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {display.budgets.map((b) => {
              const cat = categoryOf(b.category);
              const spent = catSpend[b.category] ?? 0;
              const limitDisp = b.limit;
              const pct = Math.min(1.2, limitDisp > 0 ? spent / limitDisp : 0);
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
                    <button
                      onClick={() => openBudget(b.category, b.limit)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={tr("stats.budget.edit")}
                    >
                      <div className="flex items-baseline justify-between">
                        <p className="truncate text-sm font-semibold">{catName(cat.id, cat.name, cat.builtin)}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(spent)} <span className="opacity-60">/ {format(limitDisp)}</span>
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
                    </button>
                    <button
                      onClick={() => removeBudget(b.id)}
                      aria-label={tr("stats.budget.delete")}
                      className="tap grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {near || over ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {over ? tr("stats.overBudget") : tr("stats.nearingLimit")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-3 text-sm font-semibold">{tr("stats.byCategory")}</h2>
        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-[var(--shadow-card)]">
          {catData.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">{tr("stats.noSpending")}</p>
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
                    {tr("stats.total")}
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
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("stats.insight")}</p>
          <p className="mt-1 text-sm font-medium">
            {net >= 0
              ? fmt(tr("stats.insight.positive"), { amt: format(net), range: tr(`stats.${range}`) })
              : fmt(tr("stats.insight.negative"), { amt: format(-net), range: tr(`stats.${range}`) })}
          </p>
        </div>
      </section>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>{tr("stats.budget.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("stats.budget.category")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setBudgetCat(c.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium",
                      budgetCat === c.id
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {catName(c.id, c.name, c.builtin)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="budget-limit">
                {tr("stats.budget.limit")}
              </Label>
              <Input
                id="budget-limit"
                inputMode="decimal"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={saveBudget}
              className="w-full rounded-full px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("action.save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}