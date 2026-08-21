import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { LifeBuoy, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useCategories, IconFor } from "@/lib/categories";
import { useCategoryName, useT, fmt } from "@/lib/i18n";
import { computeRunway, type RunwayState } from "@/lib/runway";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/runway")({
  head: () => ({
    meta: [
      { title: "Emergency Fund · NOVA" },
      {
        name: "description",
        content:
          "See how many months your liquid money would cover your expenses, and track your emergency fund target.",
      },
      { property: "og:title", content: "Emergency Fund · NOVA" },
      {
        property: "og:description",
        content: "Financial runway and emergency fund progress based on your real spending.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RunwayPage,
});

const TARGETS = [3, 6, 12] as const;

const STATE_TONE: Record<RunwayState, string> = {
  none: "text-muted-foreground",
  critical: "text-rose-400",
  building: "text-amber-400",
  healthy: "text-emerald-400",
  strong: "text-primary",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RunwayPage() {
  const { state, setSettings } = useNova();
  const display = useDisplayState();
  const { format } = useCurrency();
  const tr = useT();
  const catName = useCategoryName();
  const expenseCats = useCategories("expense");

  const essentialCategories = state.settings.essentialCategories ?? [];
  const targetMonths = state.settings.emergencyTargetMonths ?? 3;

  const r = useMemo(
    () =>
      computeRunway({
        accounts: display.accounts,
        transactions: display.transactions,
        essentialCategories,
        targetMonths,
      }),
    [display.accounts, display.transactions, essentialCategories, targetMonths],
  );

  const months = (n: number | null) => (n == null ? "—" : fmt(tr("ef.months"), { n: n.toFixed(1) }));

  const toggleCat = (id: string) => {
    const next = essentialCategories.includes(id)
      ? essentialCategories.filter((c) => c !== id)
      : [...essentialCategories, id];
    setSettings({ essentialCategories: next });
  };

  if (display.accounts.length === 0) {
    return (
      <AppShell>
        <PageHeader back subtitle={tr("ef.subtitle")} title={tr("ef.title")} right={<CurrencyPicker />} />
        <section className="px-5">
          <EmptyState
            icon={<WalletIcon className="h-6 w-6" />}
            title={tr("ef.noAccounts")}
            description={tr("ef.noAccountsDesc")}
            ctaLabel={tr("nav.wallet")}
            ctaTo="/wallet"
          />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader back subtitle={tr("ef.subtitle")} title={tr("ef.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <LifeBuoy className="h-4 w-4" />
            <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
              {tr("ef.liquid")}
            </span>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{format(r.liquid)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("ef.liquidNote")}</p>
          <p className={cn("mt-3 text-sm font-semibold", STATE_TONE[r.state])}>
            {tr(`ef.state.${r.state}`)}
          </p>
          {r.monthsUsed > 0 ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {fmt(tr("ef.basedOn"), { n: r.monthsUsed })}
              {r.limitedHistory ? ` · ${tr("ef.limited")}` : ""}
            </p>
          ) : null}
        </div>
      </section>

      {r.monthsUsed === 0 ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title={tr("ef.noHistory")}
            description={tr("ef.noHistoryDesc")}
          />
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 px-5 pt-4">
            <Stat label={tr("ef.avgMonthly")} value={format(r.avgMonthly)} />
            <Stat label={tr("ef.avgEssential")} value={format(r.avgEssential)} />
            <Stat label={tr("ef.totalRunway")} value={months(r.totalRunway)} />
            <Stat
              label={tr("ef.essentialRunway")}
              value={r.essentialRunway == null ? tr("ef.noEssential") : months(r.essentialRunway)}
            />
          </section>

          <section className="px-5 pt-5">
            <h2 className="mb-2 text-sm font-semibold tracking-tight">{tr("ef.target")}</h2>
            <div className="flex gap-2">
              {TARGETS.map((m) => (
                <button
                  key={m}
                  onClick={() => setSettings({ emergencyTargetMonths: m })}
                  className={cn(
                    "press flex-1 rounded-xl border px-3 py-2 text-xs font-semibold",
                    targetMonths === m
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-card/60 text-muted-foreground",
                  )}
                >
                  {fmt(tr("ef.months"), { n: m })}
                </button>
              ))}
              <label className="flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-2.5">
                <span className="text-[11px] text-muted-foreground">{tr("ef.customMonths")}</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={targetMonths}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1 && n <= 60) {
                      setSettings({ emergencyTargetMonths: Math.round(n) });
                    }
                  }}
                  aria-label={tr("ef.customMonths")}
                  className="w-10 bg-transparent py-2 text-xs font-semibold outline-none"
                />
              </label>
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              {r.target == null ? (
                <p className="text-xs text-muted-foreground">{tr("ef.noEssential")}</p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{tr("ef.current")}</span>
                    <span className="text-sm font-semibold">{format(r.liquid)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{tr("ef.targetValue")}</span>
                    <span className="text-sm font-semibold">{format(r.target)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{tr("ef.remaining")}</span>
                    <span className="text-sm font-semibold">{format(r.remaining ?? 0)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.round((r.progress ?? 0) * 100)}%`,
                        background: "var(--gradient-primary)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[11px] text-muted-foreground">
                    {Math.round((r.progress ?? 0) * 100)}%
                  </p>
                </>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">{tr("ef.planningNote")}</p>
            </div>
          </section>
        </>
      )}

      <section className="px-5 py-5">
        <h2 className="text-sm font-semibold tracking-tight">{tr("ef.essentialCats")}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{tr("ef.essentialHint")}</p>
        <div className="space-y-2">
          {expenseCats.map((c) => {
            const on = essentialCategories.includes(c.id);
            const avg = r.byCategory.find((b) => b.category === c.id)?.avg ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                aria-pressed={on}
                className={cn(
                  "press flex w-full items-center gap-3 rounded-2xl border p-3 text-left",
                  on ? "border-primary/50 bg-primary/10" : "border-border bg-card/60",
                )}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                  style={{ background: `color-mix(in oklch, ${c.color} 22%, transparent)` }}
                >
                  <IconFor name={c.icon} className="h-4 w-4" style={{ color: c.color }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{catName(c.id, c.name, c.builtin)}</span>
                {avg > 0 ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {fmt(tr("ef.avgPerMonth"), { amount: format(avg) })}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
