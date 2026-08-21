import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CreditCard, TrendingDown, AlertTriangle, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova, liabilityCurrency } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useT, fmt, useDateLabels } from "@/lib/i18n";
import {
  buildPayoffPlan,
  hasAprData,
  isPlannable,
  interestSaving,
  type DebtInput,
  type PayoffStrategy,
} from "@/lib/debt-payoff";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/debt")({
  head: () => ({
    meta: [
      { title: "Debt Payoff Planner · NOVA" },
      {
        name: "description",
        content:
          "Compare Snowball and Avalanche payoff strategies, see your debt-free date and total interest.",
      },
      { property: "og:title", content: "Debt Payoff Planner · NOVA" },
      {
        property: "og:description",
        content: "Plan how fast you can clear your loans, cards and mortgage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DebtPage,
});

const STRATEGIES: PayoffStrategy[] = ["minimum", "snowball", "avalanche"];

function Stat({ label, value, tone }: { label: string; value: string; tone?: "down" }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tracking-tight",
          tone === "down" && "text-rose-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DebtPage() {
  const { state } = useNova();
  const display = useDisplayState();
  const { format } = useCurrency();
  const t = useT();
  const labels = useDateLabels();
  const [strategy, setStrategy] = useState<PayoffStrategy>("avalanche");
  const [extraInput, setExtraInput] = useState("");

  const extra = useMemo(() => {
    const n = Number(extraInput.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [extraInput]);

  // Liabilities in `display` are already converted exactly once into the
  // active display currency. Native balances are never mutated here.
  const debts: DebtInput[] = useMemo(
    () =>
      display.liabilities.map((l) => ({
        id: l.id,
        name: l.name,
        balance: l.balance,
        apr: l.apr,
        minPayment: l.minPayment,
      })),
    [display.liabilities],
  );

  const plan = useMemo(() => buildPayoffPlan(debts, strategy, extra), [debts, strategy, extra]);
  const snowball = useMemo(() => buildPayoffPlan(debts, "snowball", extra), [debts, extra]);
  const avalanche = useMemo(() => buildPayoffPlan(debts, "avalanche", extra), [debts, extra]);

  const canCompare =
    snowball.feasible && avalanche.feasible && hasAprData(debts) && debts.filter(isPlannable).length > 1;
  const saving = interestSaving(avalanche, snowball);

  const mixedCurrencies = useMemo(
    () => new Set(state.liabilities.map((l) => liabilityCurrency(l))).size > 1,
    [state.liabilities],
  );

  const monthLabel = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString(labels.locale, { month: "short", year: "numeric" }) : "—";

  if (state.liabilities.filter((l) => l.balance > 0).length === 0) {
    return (
      <AppShell>
        <PageHeader back subtitle={t("dp.subtitle")} title={t("dp.title")} right={<CurrencyPicker />} />
        <section className="px-5 pt-4">
          <EmptyState
            icon={<CreditCard className="h-6 w-6" />}
            title={t("dp.empty")}
            description={t("dp.emptyDesc")}
            ctaLabel={t("dp.addLiability")}
            ctaTo="/networth"
          />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader back subtitle={t("dp.subtitle")} title={t("dp.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="flex gap-2">
          {STRATEGIES.map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={cn(
                "press flex-1 rounded-full border px-3 py-2 text-xs font-medium",
                strategy === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground",
              )}
            >
              {s === "minimum" ? t("dp.min") : s === "snowball" ? t("dp.snowball") : t("dp.avalanche")}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {strategy === "minimum"
            ? t("dp.minDesc")
            : strategy === "snowball"
              ? t("dp.snowballDesc")
              : t("dp.avalancheDesc")}
        </p>
      </section>

      <section className="px-5 pt-4">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("dp.debtFree")}
          </p>
          <p
            className={cn(
              "mt-1 text-3xl font-semibold tracking-tight",
              !plan.feasible && "text-rose-400",
            )}
          >
            {plan.debtFreeDate ? monthLabel(plan.debtFreeDate) : t("dp.noPlan")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.feasible ? fmt(t("dp.mo"), { n: plan.months }) : t("dp.noPlanDesc")}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 px-5 pt-3">
        <Stat label={t("dp.interest")} value={format(plan.totalInterest)} tone="down" />
        <Stat label={t("dp.totalPaid")} value={format(plan.totalPaid)} />
      </section>

      <section className="px-5 pt-4">
        <Label htmlFor="dp-extra" className="text-xs text-muted-foreground">
          {t("dp.extra")}
        </Label>
        <Input
          id="dp-extra"
          inputMode="decimal"
          value={extraInput}
          onChange={(e) => setExtraInput(e.target.value)}
          placeholder="0"
          className="mt-1.5 rounded-2xl"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t("dp.extraHint")}</p>
      </section>

      {plan.stalled.length > 0 ? (
        <section className="px-5 pt-4">
          <div className="flex gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-200">
              {fmt(t("dp.warnStalled"), { names: plan.stalled.join(", ") })}
            </p>
          </div>
        </section>
      ) : null}

      {plan.skipped.length > 0 ? (
        <section className="px-5 pt-3">
          <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            {fmt(t("dp.warnSkipped"), { names: plan.skipped.join(", ") })}
          </p>
        </section>
      ) : null}

      {canCompare ? (
        <section className="px-5 pt-4">
          <h2 className="mb-2 text-sm font-semibold">{t("dp.compare")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "avalanche", plan: avalanche, label: t("dp.avalanche") },
              { key: "snowball", plan: snowball, label: t("dp.snowball") },
            ].map((c) => (
              <div key={c.key} className="rounded-2xl border border-border bg-card/70 p-4">
                <p className="text-xs font-semibold">{c.label}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{t("dp.debtFree")}</p>
                <p className="text-sm font-medium">{monthLabel(c.plan.debtFreeDate ?? "")}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{t("dp.interest")}</p>
                <p className="text-sm font-medium">{format(c.plan.totalInterest)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-foreground">
              {saving > 0.5
                ? fmt(t("dp.saving"), { amount: format(saving) })
                : t("dp.savingNone")}
            </p>
          </div>
        </section>
      ) : hasAprData(debts) ? null : (
        <section className="px-5 pt-4">
          <p className="text-xs text-muted-foreground">{t("dp.noApr")}</p>
        </section>
      )}

      <section className="px-5 pt-5">
        <h2 className="mb-2 text-sm font-semibold">{t("dp.timeline")}</h2>
        <ul className="space-y-2">
          {plan.lines.map((line) => {
            const pct =
              plan.feasible && plan.months > 0
                ? Math.min(100, Math.round((line.months / plan.months) * 100))
                : 100;
            const native = state.liabilities.find((l) => l.id === line.id);
            return (
              <li key={line.id} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold">
                    {line.order}. {line.name}
                  </p>
                  <p className="shrink-0 text-sm font-semibold text-rose-400">
                    {format(line.startBalance)}
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("dp.apr")}:{" "}
                  {native?.apr != null ? `${native.apr}%` : t("dp.unknown")} · {t("dp.minPayment")}:{" "}
                  {native?.minPayment != null ? format(line.startBalance > 0 ? (debts.find((d) => d.id === line.id)?.minPayment ?? 0) : 0) : t("dp.unknown")}{" "}
                  · {t("dp.payoffDate")}: {line.payoffDate ? monthLabel(line.payoffDate) : t("dp.noPlan")}
                </p>
              </li>
            );
          })}
        </ul>
        {mixedCurrencies ? (
          <p className="mt-3 text-[11px] text-muted-foreground">{t("dp.fxNote")}</p>
        ) : null}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TrendingDown className="h-3 w-3" /> {t("dp.planner")}
        </p>
      </section>
    </AppShell>
  );
}
