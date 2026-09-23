import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, CheckCircle2, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useCategoryLookup } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { useT, useLocale, fmt } from "@/lib/i18n";
import {
  buildCalendar,
  dayKey,
  rangeFor,
  shiftCursor,
  startOfDay,
  CAL_VIEWS,
  type CalDay,
  type CalEvent,
  type CalView,
} from "@/lib/cashflow-calendar";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Cash Flow Calendar · NOVA" },
      {
        name: "description",
        content:
          "See posted and expected money movement day by day, with daily net flow and a running available-cash balance.",
      },
      { property: "og:title", content: "Cash Flow Calendar · NOVA" },
      {
        property: "og:description",
        content: "A read-only day, week and month timeline of your bills, subscriptions and expected income.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const DAY_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function CalendarPage() {
  const display = useDisplayState();
  const { format } = useCurrency();
  const categoryOf = useCategoryLookup();
  const tr = useT();
  const locale = useLocale();
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<CalView>("month");
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [selected, setSelected] = useState<string>(() => dayKey(Date.now()));

  const todayKey = dayKey(Date.now());

  const result = useMemo(
    () =>
      buildCalendar({
        view,
        cursor,
        accounts: display.accounts,
        transactions: display.transactions,
        recurring: display.recurring,
        subscriptions: display.subscriptions,
      }),
    [view, cursor, display.accounts, display.transactions, display.recurring, display.subscriptions],
  );

  // Keep the selection inside the visible range.
  useEffect(() => {
    if (!result.days.some((d) => d.key === selected)) {
      setSelected(result.days.find((d) => d.key === todayKey)?.key ?? result.days[0]?.key ?? "");
    }
  }, [result.days, selected, todayKey]);

  const move = useCallback(
    (dir: -1 | 1) => setCursor((c) => shiftCursor(view, c, dir)),
    [view],
  );

  const moveDay = useCallback(
    (delta: number) => {
      const days = result.days;
      const idx = days.findIndex((d) => d.key === selected);
      const next = idx + delta;
      if (next >= 0 && next < days.length) {
        setSelected(days[next]!.key);
        return;
      }
      // Step outside the range: shift the period and land on the edge day.
      const nextCursor = shiftCursor(view, cursor, delta > 0 ? 1 : -1);
      const range = rangeFor(view, nextCursor);
      setCursor(nextCursor);
      setSelected(dayKey(delta > 0 ? range.start : range.end));
    },
    [result.days, selected, view, cursor],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "PageUp", "PageDown"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      if (e.key === "ArrowLeft") moveDay(-1);
      else if (e.key === "ArrowRight") moveDay(1);
      else if (e.key === "ArrowUp") moveDay(view === "month" ? -7 : -1);
      else if (e.key === "ArrowDown") moveDay(view === "month" ? 7 : 1);
      else if (e.key === "PageUp") move(-1);
      else if (e.key === "PageDown") move(1);
      else if (e.key === "Home") {
        setCursor(startOfDay(Date.now()));
        setSelected(todayKey);
      }
    },
    [move, moveDay, todayKey, view],
  );

  const periodLabel = useMemo(() => {
    const start = new Date(result.start);
    const end = new Date(result.end);
    if (view === "day") {
      return start.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    }
    if (view === "week") {
      return `${start.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(
        locale,
        { day: "numeric", month: "short" },
      )}`;
    }
    return start.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }, [result.start, result.end, view, locale]);

  const selectedDay = result.days.find((d) => d.key === selected) ?? null;

  const leading = useMemo(() => {
    if (view !== "month") return 0;
    return (new Date(result.start).getDay() + 6) % 7;
  }, [view, result.start]);

  const hasAnything = result.days.some((d) => d.events.length > 0);

  return (
    <AppShell>
      <PageHeader back subtitle={tr("cal.subtitle")} title={tr("cal.title")} right={<CurrencyPicker />} />

      <section className="px-4 sm:px-5">
        <div className="flex gap-2" role="tablist" aria-label={tr("cal.viewLabel")}>
          {CAL_VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "press min-h-11 flex-1 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === v
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground",
              )}
            >
              {tr(`cal.view.${v}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-3 px-4 sm:px-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-border bg-card/70 px-2 py-2 backdrop-blur">
          <button
            onClick={() => move(-1)}
            aria-label={tr("cal.prev")}
            className="tap grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="truncate text-center text-sm font-semibold" aria-live="polite">
            {periodLabel}
          </p>
          <button
            onClick={() => move(1)}
            aria-label={tr("cal.next")}
            className="tap grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              setCursor(startOfDay(Date.now()));
              setSelected(todayKey);
            }}
            className="press min-h-9 rounded-full border border-border bg-card/60 px-3 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tr("cal.today")}
          </button>
          <p className="text-[10px] text-muted-foreground">{tr("cal.keyHint")}</p>
        </div>
      </section>

      {/* Summary */}
      <section className="mt-4 grid grid-cols-2 gap-2 px-4 sm:px-5">
        <Stat label={tr("cal.availableNow")} value={format(result.startBalance)} />
        <Stat
          label={tr("cal.endBalance")}
          value={result.endBalance === null ? "—" : format(result.endBalance)}
          tone={result.endBalance !== null && result.endBalance < 0 ? "down" : undefined}
        />
        <Stat label={tr("cal.expectedIn")} value={format(result.expectedIncome)} tone="up" />
        <Stat label={tr("cal.expectedOut")} value={format(-result.expectedExpense)} tone="down" />
      </section>

      {result.lowestBalance !== null && result.lowestBalance < 0 ? (
        <section className="mt-3 px-4 sm:px-5">
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
            {fmt(tr("cal.negativeWarn"), { amount: format(result.lowestBalance) })}
          </p>
        </section>
      ) : null}

      {/* Grid / list */}
      <section
        className="mt-4 px-4 sm:px-5"
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label={tr("cal.gridLabel")}
        onKeyDown={onKeyDown}
      >
        {view === "month" ? (
          <>
            <div className="mb-2 grid grid-cols-7 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
              {DAY_LABELS.map((d) => (
                <div key={d}>{tr(`cal.${d}`)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {Array.from({ length: leading }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square rounded-xl" />
              ))}
              {result.days.map((d) => (
                <DayCell
                  key={d.key}
                  day={d}
                  selected={d.key === selected}
                  today={d.key === todayKey}
                  onSelect={() => setSelected(d.key)}
                  label={tr("cal.dayLabel")}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            {result.days.map((d) => (
              <button
                key={d.key}
                onClick={() => setSelected(d.key)}
                aria-current={d.key === selected ? "date" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  d.key === selected ? "border-primary bg-primary/10" : "border-border bg-card/60",
                )}
              >
                <div className="w-14 shrink-0">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(d.ts).toLocaleDateString(locale, { weekday: "short" })}
                  </p>
                  <p className="text-sm font-semibold">{new Date(d.ts).getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {d.events.length
                      ? fmt(tr("cal.nEvents"), { n: d.events.length })
                      : tr("cal.noEvents")}
                  </p>
                  <Dots day={d} />
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      d.net > 0 ? "text-emerald-400" : d.net < 0 ? "text-rose-400" : "text-muted-foreground",
                    )}
                  >
                    {d.net === 0 ? "—" : format(d.net, { signed: true })}
                  </p>
                  {d.balance !== null ? (
                    <p className="text-[10px] text-muted-foreground">{format(d.balance)}</p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="mt-4 px-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-card/60 px-3 py-2 text-[10px] text-muted-foreground">
          <Legend color="oklch(0.82 0.18 155)" label={tr("cal.legend.in")} />
          <Legend color="oklch(0.7 0.2 30)" label={tr("cal.legend.out")} />
          <Legend color="oklch(0.75 0.15 260)" label={tr("cal.legend.expected")} dashed />
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" />
            {tr("cal.legend.posted")}
          </span>
        </div>
      </section>

      {/* Selected day */}
      <section className="mt-4 px-4 sm:px-5">
        {selectedDay ? (
          <div className="animate-fade-in rounded-3xl border border-border bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur">
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {new Date(selectedDay.ts).toLocaleDateString(locale, { weekday: "long" })}
                </p>
                <p className="truncate text-lg font-semibold">
                  {new Date(selectedDay.ts).toLocaleDateString(locale, {
                    day: "numeric",
                    month: "long",
                  })}

                </p>
              </div>
              {selectedDay.balance !== null ? (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {tr("cal.runningBalance")}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      selectedDay.balance < 0 ? "text-rose-400" : "text-foreground",
                    )}
                  >
                    {format(selectedDay.balance)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label={tr("cal.income")} value={format(selectedDay.income)} tone="up" small />
              <Stat label={tr("cal.expenses")} value={format(-selectedDay.expense)} tone="down" small />
              <Stat label={tr("cal.net")} value={format(selectedDay.net, { signed: true })} small />
            </div>

            {selectedDay.events.length ? (
              <ul className="mt-4 space-y-2">
                {selectedDay.events.map((e) => (
                  <EventRow key={e.id} event={e} categoryOf={categoryOf} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-center text-xs text-muted-foreground">{tr("cal.nothing")}</p>
            )}
          </div>
        ) : null}
      </section>

      {!hasAnything ? (
        <section className="mt-4 px-4 sm:px-5">
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title={tr("cal.emptyTitle")}
            description={tr("cal.emptyDesc")}
            ctaLabel={tr("cal.emptyCta")}
            ctaTo="/subscriptions"
          />
        </section>
      ) : null}

      {result.duplicatesSkipped > 0 ? (
        <section className="mt-3 px-4 sm:px-5">
          <p className="text-[11px] text-muted-foreground">
            {fmt(tr("cal.dupSkipped"), { n: result.duplicatesSkipped })}
          </p>
        </section>
      ) : null}

      <section className="mt-3 px-4 sm:px-5">
        <p className="rounded-2xl border border-border bg-card/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {tr("cal.disclaimer")}
        </p>
      </section>

      <div className="h-6" />
    </AppShell>
  );
}

function Dots({ day }: { day: CalDay }) {
  return (
    <span className="mt-1 flex h-1.5 items-center gap-1">
      {day.income > 0 ? <Dot color="oklch(0.82 0.18 155)" /> : null}
      {day.expense > 0 ? <Dot color="oklch(0.7 0.2 30)" /> : null}
      {day.hasExpected ? <Dot color="oklch(0.75 0.15 260)" /> : null}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="h-1 w-1 rounded-full" style={{ background: color }} />;
}

function DayCell({
  day,
  selected,
  today,
  onSelect,
  label,
}: {
  day: CalDay;
  selected: boolean;
  today: boolean;
  onSelect: () => void;
  label: string;
}) {
  const hasActivity = day.events.length > 0;
  return (
    <button
      onClick={onSelect}
      tabIndex={selected ? 0 : -1}
      aria-label={`${label} ${new Date(day.ts).getDate()}`}
      aria-current={selected ? "date" : undefined}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-[11px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/15"
          : today
            ? "border-primary/40 bg-card/80"
            : hasActivity
              ? "border-border bg-card/70"
              : "border-transparent bg-card/40",
      )}
    >
      <span className={cn("text-xs font-semibold", today && !selected ? "text-primary" : "text-foreground")}>
        {new Date(day.ts).getDate()}
      </span>
      <Dots day={day} />
    </button>
  );
}

function EventRow({
  event,
  categoryOf,
}: {
  event: CalEvent;
  categoryOf: ReturnType<typeof useCategoryLookup>;
}) {
  const tr = useT();
  const { format } = useCurrency();
  const cat = categoryOf(event.category ?? "other");
  const Icon = cat.icon;
  const expected = event.status === "expected";

  const body = (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
      >
        <Icon className="h-4 w-4" style={{ color: cat.color }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          {expected ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {expected ? tr("cal.status.expected") : tr("cal.status.posted")}
          {event.transfer ? ` · ${tr("cal.transferNote")}` : null}
          {event.adjustment ? ` · ${tr("cal.adjustmentNote")}` : null}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold",
          event.transfer || event.adjustment
            ? "text-muted-foreground"
            : event.amount >= 0
              ? "text-emerald-400"
              : "text-foreground",
          expected && "opacity-80",
        )}
      >
        {format(event.amount, { signed: true })}
      </span>
    </>
  );

  const rowClass = cn(
    "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    expected ? "border-dashed border-border/70 bg-muted/20" : "border-border bg-muted/30",
  );

  // Deep links open the existing detail view only — never an action.
  const to =
    event.source === "subscription" ? "/subscriptions" : event.source === "recurring" ? "/automation" : "/wallet";

  return (
    <li>
      <Link to={to} className={rowClass} aria-label={`${event.title} — ${tr("cal.openDetails")}`}>
        {body}
      </Link>
    </li>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("h-1.5 w-1.5 rounded-full", dashed && "ring-1 ring-current")}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur">
      <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold tracking-tight",
          small ? "text-xs" : "text-sm",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
