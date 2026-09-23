import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RotateCcw, Sparkle, TrendingUp, Wallet as WalletIcon } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova, netWorthBreakdown } from "@/lib/nova-store";
import { convertAmount, useCurrency, type CurrencyCode } from "@/lib/currency";
import { useT, fmt } from "@/lib/i18n";
import {
  EMPTY_RAW,
  WHATIF_HORIZONS,
  buildWhatIf,
  validateWhatIf,
  type WhatIfDirection,
  type WhatIfRawInput,
} from "@/lib/whatif";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/whatif")({
  head: () => ({
    meta: [
      { title: "What-If planner · NOVA" },
      {
        name: "description",
        content: "Model a one-off or monthly change against your cash flow without saving anything.",
      },
      { property: "og:title", content: "What-If planner · NOVA" },
      {
        property: "og:description",
        content: "A private sandbox for estimating how a future change affects your balance and net worth.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatIfPage,
});

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "up" | "down"; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
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

function WhatIfPage() {
  const { state } = useNova();
  const display = useDisplayState();
  const { format, currency } = useCurrency();
  const tr = useT();

  const [raw, setRaw] = useState<WhatIfRawInput>(EMPTY_RAW);
  const patch = (next: Partial<WhatIfRawInput>) => setRaw((prev) => ({ ...prev, ...next }));

  const to = currency.code as CurrencyCode;
  const buffer = convertAmount(state.settings.forecastBuffer ?? 0, "USD", to);
  const netWorth = useMemo(() => netWorthBreakdown(display).net, [display]);

  const validation = useMemo(() => validateWhatIf(raw), [raw]);
  const hasData =
    display.accounts.length > 0 ||
    display.recurring.length > 0 ||
    display.subscriptions.length > 0;

  const result = useMemo(
    () =>
      validation.ok
        ? buildWhatIf({
            scenario: validation.scenario,
            accounts: display.accounts,
            recurring: display.recurring,
            subscriptions: display.subscriptions,
            netWorth,
            safetyBuffer: buffer,
          })
        : null,
    [validation, display.accounts, display.recurring, display.subscriptions, netWorth, buffer],
  );

  const blockingIssues = validation.issues.filter((i) => i !== "empty");
  const isEmptyScenario = validation.issues.includes("empty");

  const dirToggle = (value: WhatIfDirection, onChange: (d: WhatIfDirection) => void, idPrefix: string) => (
    <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 text-[11px]">
      {(["expense", "income"] as const).map((k) => (
        <button
          key={k}
          type="button"
          id={`${idPrefix}-${k}`}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded-full px-3 py-1.5 transition-colors",
            value === k ? "text-primary-foreground" : "text-muted-foreground",
          )}
          style={value === k ? { background: "var(--gradient-primary)" } : undefined}
        >
          {tr(`wi.dir.${k}`)}
        </button>
      ))}
    </div>
  );

  return (
    <AppShell>
      <PageHeader subtitle={tr("wi.subtitle")} title={tr("wi.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="flex gap-3 rounded-3xl border border-border bg-card/60 p-4 backdrop-blur">
          <Sparkle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{tr("wi.sandboxTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tr("wi.sandboxBody")}</p>
          </div>
        </div>
      </section>

      {!hasData ? (
        <section className="mt-5 px-5">
          <EmptyState
            icon={<WalletIcon className="h-5 w-5" />}
            title={tr("wi.empty.title")}
            description={tr("wi.empty.desc")}
            ctaLabel={tr("wi.empty.cta")}
            ctaTo="/wallet"
          />
        </section>
      ) : (
        <>
          <section className="mt-5 px-5">
            <h2 className="text-sm font-semibold">{tr("wi.scenario")}</h2>

            <fieldset className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
              <legend className="px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                {tr("wi.oneOff")}
              </legend>
              <div className="flex items-center justify-between gap-3">
                <label className="min-w-0 flex-1" htmlFor="wi-oneoff-amount">
                  <span className="block text-[11px] text-muted-foreground">{tr("wi.amount")}</span>
                  <input
                    id="wi-oneoff-amount"
                    inputMode="decimal"
                    value={raw.oneOffAmount}
                    onChange={(e) => patch({ oneOffAmount: e.target.value })}
                    placeholder="0"
                    className="mt-1 w-full bg-transparent text-base outline-none"
                  />
                </label>
                {dirToggle(raw.oneOffDirection, (d) => patch({ oneOffDirection: d }), "wi-oneoff")}
              </div>
              <label className="mt-3 block" htmlFor="wi-oneoff-date">
                <span className="block text-[11px] text-muted-foreground">{tr("wi.date")}</span>
                <input
                  id="wi-oneoff-date"
                  type="date"
                  value={raw.oneOffDate}
                  onChange={(e) => patch({ oneOffDate: e.target.value })}
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                />
              </label>
            </fieldset>

            <fieldset className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
              <legend className="px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                {tr("wi.monthly")}
              </legend>
              <div className="flex items-center justify-between gap-3">
                <label className="min-w-0 flex-1" htmlFor="wi-monthly-amount">
                  <span className="block text-[11px] text-muted-foreground">{tr("wi.amountPerMonth")}</span>
                  <input
                    id="wi-monthly-amount"
                    inputMode="decimal"
                    value={raw.monthlyAmount}
                    onChange={(e) => patch({ monthlyAmount: e.target.value })}
                    placeholder="0"
                    className="mt-1 w-full bg-transparent text-base outline-none"
                  />
                </label>
                {dirToggle(raw.monthlyDirection, (d) => patch({ monthlyDirection: d }), "wi-monthly")}
              </div>
            </fieldset>

            <div className="mt-3">
              <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">{tr("wi.horizon")}</p>
              <div className="flex gap-2" role="group" aria-label={tr("wi.horizon")}>
                {WHATIF_HORIZONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={raw.horizon === h}
                    onClick={() => patch({ horizon: h })}
                    className={cn(
                      "flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                      raw.horizon === h ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-card/60 text-muted-foreground",
                    )}
                  >
                    {fmt(tr("wi.days"), { days: h })}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRaw(EMPTY_RAW)}
              className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-semibold"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> {tr("wi.reset")}
            </button>
          </section>

          <div aria-live="polite" className="px-5">
            {blockingIssues.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                {blockingIssues.map((issue) => (
                  <li key={issue}>{tr(`wi.err.${issue}`)}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {isEmptyScenario && blockingIssues.length === 0 ? (
            <section className="mt-4 px-5">
              <EmptyState
                icon={<TrendingUp className="h-5 w-5" />}
                title={tr("wi.start.title")}
                description={tr("wi.start.desc")}
              />
            </section>
          ) : null}

          {result ? (
            <>
              <section className="mt-5 grid grid-cols-2 gap-2 px-5">
                <Stat
                  label={tr("wi.projected")}
                  value={format(result.scenarioEnd)}
                  tone={result.scenarioEnd >= 0 ? "up" : "down"}
                  hint={fmt(tr("wi.days"), { days: result.horizon })}
                />
                <Stat
                  label={tr("wi.impact")}
                  value={format(result.delta)}
                  tone={result.delta >= 0 ? "up" : "down"}
                  hint={tr("wi.vsBaseline")}
                />
                <Stat label={tr("wi.baseline")} value={format(result.baselineEnd)} />
                <Stat
                  label={tr("wi.lowest")}
                  value={format(result.scenarioLowest)}
                  tone={result.scenarioLowest < 0 ? "down" : undefined}
                />
                <Stat label={tr("wi.netWorthNow")} value={format(result.netWorthNow)} />
                <Stat
                  label={tr("wi.netWorthAfter")}
                  value={format(result.netWorthAfter)}
                  tone={result.netWorthAfter >= result.netWorthNow ? "up" : "down"}
                />
              </section>

              <section className="mt-3 px-5">
                <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                  <p className="flex items-center gap-2 text-sm">
                    {result.delta >= 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                    )}
                    <span className="font-semibold">{tr("wi.cashIn")}</span>
                    <span className="ml-auto text-emerald-400">{format(result.scenarioIncome)}</span>
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <ArrowDownRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
                    <span className="font-semibold">{tr("wi.cashOut")}</span>
                    <span className="ml-auto text-rose-400">{format(-result.scenarioExpenses)}</span>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {fmt(tr("wi.startingFrom"), { amount: format(result.startBalance) })}
                  </p>
                </div>
              </section>

              {result.scenarioNegativeDate || result.scenarioBufferDate ? (
                <section className="mt-3 px-5">
                  <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                    {result.scenarioNegativeDate ? tr("wi.warn.negative") : tr("wi.warn.buffer")}
                  </p>
                </section>
              ) : null}

              <section className="mt-4 px-5">
                <h2 className="text-sm font-semibold">{tr("wi.assumptions")}</h2>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <li>{tr("wi.assume.liquid")}</li>
                  <li>{tr("wi.assume.recurring")}</li>
                  <li>{fmt(tr("wi.assume.monthly"), { count: result.monthlyOccurrences })}</li>
                  <li>{tr("wi.assume.transfers")}</li>
                  <li>{fmt(tr("wi.assume.currency"), { currency: currency.code })}</li>
                </ul>
              </section>
            </>
          ) : null}
        </>
      )}

      <section className="mt-5 px-5 pb-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">{tr("wi.disclaimer")}</p>
      </section>
    </AppShell>
  );
}
