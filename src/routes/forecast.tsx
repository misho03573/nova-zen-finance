import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ShieldCheck, TrendingUp, Wallet as WalletIcon } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova } from "@/lib/nova-store";
import { convertAmount, useCurrency, type CurrencyCode } from "@/lib/currency";
import { useT, fmt, useDateLabels } from "@/lib/i18n";
import { buildForecast } from "@/lib/forecast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Cash Flow Forecast · NOVA" },
      {
        name: "description",
        content:
          "Project your future balance from recurring income, bills and active subscriptions over 7, 30 and 90 days.",
      },
      { property: "og:title", content: "Cash Flow Forecast · NOVA" },
      {
        property: "og:description",
        content: "See your projected balance and low-balance risks before they happen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForecastPage,
});

const RANGES = [7, 30, 90] as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
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
    </div>
  );
}

function ForecastPage() {
  const { state, setSettings } = useNova();
  const display = useDisplayState();
  const { format, currency } = useCurrency();
  const tr = useT();
  const labels = useDateLabels();
  const [days, setDays] = useState<number>(30);

  const to = currency.code as CurrencyCode;
  // The buffer is persisted in the neutral USD base so switching display
  // currency converts it instead of relabelling it.
  const bufferBase = state.settings.forecastBuffer ?? 0;
  const buffer = convertAmount(bufferBase, "USD", to);
  const [bufferInput, setBufferInput] = useState<string>(() => (buffer ? String(Math.round(buffer)) : ""));

  const forecast = useMemo(
    () =>
      buildForecast({
        days,
        accounts: display.accounts,
        recurring: display.recurring,
        subscriptions: display.subscriptions,
        safetyBuffer: buffer,
      }),
    [days, display.accounts, display.recurring, display.subscriptions, buffer],
  );

  const dateStr = (iso: string) =>
    new Date(iso).toLocaleDateString(labels.locale, { day: "numeric", month: "long" });

  const hasEvents = forecast.events.length > 0;

  const chart = useMemo(() => {
    const values = [forecast.startBalance, ...forecast.running];
    const min = Math.min(...values, buffer > 0 ? buffer : Math.min(...values));
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const w = 300;
    const h = 90;
    const pts = values.map((v, i) => {
      const x = values.length === 1 ? 0 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const zeroY = h - ((0 - min) / range) * h;
    const bufY = h - ((buffer - min) / range) * h;
    return { pts: pts.join(" "), w, h, zeroY, bufY, min, max };
  }, [forecast, buffer]);

  const saveBuffer = () => {
    const n = Number(bufferInput.replace(",", "."));
    const safe = Number.isFinite(n) && n > 0 ? n : 0;
    setSettings({ forecastBuffer: convertAmount(safe, to, "USD") });
  };

  return (
    <AppShell>
      <PageHeader subtitle={tr("fc.subtitle")} title={tr("fc.title")} right={<CurrencyPicker />} />

      <section className="px-5">
        <div className="flex gap-2">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "press flex-1 rounded-full border px-3 py-2 text-xs font-medium",
                days === d
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground",
              )}
            >
              {fmt(tr("fc.days"), { n: d })}
            </button>
          ))}
        </div>
      </section>

      {!hasEvents ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<TrendingUp className="h-6 w-6" />}
            title={tr("fc.empty")}
            description={tr("fc.emptyDesc")}
            ctaLabel={tr("fc.addRecurring")}
            ctaTo="/subscriptions"
          />
        </section>
      ) : (
        <>
          <section className="px-5 pt-4">
            <div
              className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
              style={{ background: "var(--gradient-card)" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {tr("fc.projected")}
              </p>
              <p
                className={cn(
                  "mt-1 text-3xl font-semibold tracking-tight",
                  forecast.endBalance < 0 && "text-rose-400",
                )}
              >
                {format(forecast.endBalance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(tr("fc.fromToday"), { amount: format(forecast.startBalance) })}
              </p>
              <svg viewBox={`0 0 ${chart.w} ${chart.h}`} className="mt-4 h-24 w-full">
                {buffer > 0 ? (
                  <line
                    x1="0"
                    x2={chart.w}
                    y1={chart.bufY}
                    y2={chart.bufY}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    className="text-amber-400/60"
                  />
                ) : null}
                {chart.min < 0 ? (
                  <line
                    x1="0"
                    x2={chart.w}
                    y1={chart.zeroY}
                    y2={chart.zeroY}
                    stroke="currentColor"
                    className="text-rose-400/50"
                  />
                ) : null}
                <polyline
                  points={chart.pts}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary"
                />
              </svg>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 px-5 pt-3">
            <Stat label={tr("fc.current")} value={format(forecast.startBalance)} />
            <Stat label={tr("fc.income")} value={format(forecast.income)} tone="up" />
            <Stat label={tr("fc.expenses")} value={format(-forecast.expenses)} tone="down" />
            <Stat
              label={tr("fc.lowest")}
              value={format(forecast.lowest)}
              tone={forecast.lowest < 0 ? "down" : undefined}
            />
          </section>

          <section className="px-5 pt-3">
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 backdrop-blur",
                forecast.negativeDate
                  ? "border-destructive/40 bg-destructive/10"
                  : forecast.bufferDate
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-primary/40 bg-primary/10",
              )}
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {forecast.negativeDate
                    ? tr("fc.critical")
                    : forecast.bufferDate
                      ? tr("fc.low")
                      : tr("fc.healthy")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {forecast.negativeDate
                    ? fmt(tr("fc.criticalMsg"), { date: dateStr(forecast.negativeDate) })
                    : forecast.bufferDate
                      ? fmt(tr("fc.lowMsg"), {
                          amount: format(buffer),
                          date: dateStr(forecast.bufferDate),
                        })
                      : tr("fc.healthyDesc")}
                </p>
              </div>
            </div>
          </section>

          <section className="px-5 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <p className="text-sm font-semibold">{tr("fc.buffer")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr("fc.bufferHint")}</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={bufferInput}
                  onChange={(e) => setBufferInput(e.target.value)}
                  placeholder="0"
                  aria-label={tr("fc.buffer")}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={saveBuffer}
                  className="press rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {tr("fc.save")}
                </button>
              </div>
            </div>
          </section>

          <section className="px-5 pt-3">
            <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <WalletIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{tr("fc.timeline")}</h2>
              </div>
              {forecast.duplicatesSkipped > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmt(tr("fc.dupSkipped"), { n: forecast.duplicatesSkipped })}
                </p>
              ) : null}
              <ul className="mt-3 space-y-2">
                {forecast.events.slice(0, 40).map((e, i) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-secondary">
                      {e.amount >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-rose-400" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {dateStr(e.date)} ·{" "}
                        {e.kind === "subscription" ? tr("fc.subscription") : tr("fc.recurring")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          e.amount >= 0 ? "text-emerald-400" : "text-foreground",
                        )}
                      >
                        {format(e.amount, { signed: true })}
                      </p>
                      <p
                        className={cn(
                          "text-[11px]",
                          forecast.running[i] < 0 ? "text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        {format(forecast.running[i])}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
      <div className="h-6" />
    </AppShell>
  );
}
