import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { useNova, type Transaction, type Recurring } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useCategoryLookup } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar · NOVA" },
      { name: "description", content: "See income, expenses, bills and goals on every day." },
    ],
  }),
  component: CalendarPage,
});

type DayInfo = {
  key: string;
  date: Date;
  income: number;
  expenses: number;
  bills: Recurring[];
  txs: Transaction[];
};

function keyFor(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function CalendarPage() {
  const { state } = useNova();
  const { format } = useCurrency();
  const categoryOf = useCategoryLookup();
  const tr = useT();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string | null>(keyFor(new Date()));

  const { grid, byKey } = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = (first.getDay() + 6) % 7; // Monday start
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const gridDates: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) gridDates.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      gridDates.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (gridDates.length % 7 !== 0) gridDates.push(null);

    const map = new Map<string, DayInfo>();
    for (const d of gridDates) {
      if (!d) continue;
      map.set(keyFor(d), { key: keyFor(d), date: d, income: 0, expenses: 0, bills: [], txs: [] });
    }
    for (const t of state.transactions) {
      const d = new Date(t.date);
      const k = keyFor(d);
      const info = map.get(k);
      if (!info) continue;
      info.txs.push(t);
      if (t.amount > 0) info.income += t.amount;
      else info.expenses += -t.amount;
    }
    for (const r of state.recurring) {
      const d = new Date(r.nextDate);
      const k = keyFor(d);
      const info = map.get(k);
      if (!info) continue;
      info.bills.push(r);
    }
    return { grid: gridDates, byKey: map };
  }, [cursor, state.transactions, state.recurring]);

  const selectedInfo = selected ? byKey.get(selected) ?? null : null;

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("cal.subtitle")}
        title={tr("cal.title")}
        right={<CurrencyPicker />}
      />

      <section className="px-5">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/70 px-3 py-2.5 backdrop-blur">
          <button
            onClick={() =>
              setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
            }
            aria-label={tr("cal.prev")}
            className="tap grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <button
            onClick={() =>
              setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
            }
            aria-label={tr("cal.next")}
            className="tap grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="mt-4 px-5">
        <div className="mb-2 grid grid-cols-7 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          {(["mon","tue","wed","thu","fri","sat","sun"] as const).map((d) => (
            <div key={d}>{tr(`cal.${d}`)}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((d, idx) => {
            if (!d)
              return <div key={`e-${idx}`} className="aspect-square rounded-xl bg-transparent" />;
            const k = keyFor(d);
            const info = byKey.get(k);
            const isToday = keyFor(new Date()) === k;
            const isSelected = selected === k;
            const hasActivity =
              !!info && (info.income > 0 || info.expenses > 0 || info.bills.length > 0);
            return (
              <button
                key={k}
                onClick={() => setSelected(k)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-[11px] transition-all",
                  isSelected
                    ? "border-primary bg-primary/15"
                    : isToday
                    ? "border-primary/40 bg-card/80"
                    : hasActivity
                    ? "border-border bg-card/70"
                    : "border-transparent bg-card/40",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-semibold",
                    isToday && !isSelected ? "text-primary" : "text-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 flex h-1.5 items-center gap-0.5">
                  {info && info.income > 0 ? (
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: "oklch(0.82 0.18 155)" }}
                    />
                  ) : null}
                  {info && info.expenses > 0 ? (
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: "oklch(0.7 0.2 30)" }}
                    />
                  ) : null}
                  {info && info.bills.length ? (
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: "oklch(0.75 0.15 260)" }}
                    />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 px-5">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <Legend color="oklch(0.82 0.18 155)" label={tr("cal.income")} />
          <Legend color="oklch(0.7 0.2 30)" label={tr("cal.expenses")} />
          <Legend color="oklch(0.75 0.15 260)" label={tr("cal.bills")} />
        </div>
      </section>

      {selectedInfo ? (
        <section className="mt-5 px-5">
          <div className="animate-fade-in rounded-3xl border border-border bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {selectedInfo.date.toLocaleDateString("en-US", {
                    weekday: "long",
                  })}
                </p>
                <p className="text-lg font-semibold">
                  {selectedInfo.date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label={tr("cal.close")}
                className="tap grid h-8 w-8 place-items-center rounded-full border border-border bg-card"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label={tr("cal.income")}
                value={format(selectedInfo.income)}
                tone="up"
              />
              <Stat
                label={tr("cal.expenses")}
                value={format(-selectedInfo.expenses)}
                tone="down"
              />
            </div>
            {selectedInfo.bills.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {tr("cal.bills")}
                </p>
                <ul className="space-y-1.5">
                  {selectedInfo.bills.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
                    >
                      <span className="text-sm">{r.title}</span>
                      <span className="text-sm font-semibold">{format(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedInfo.txs.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {tr("cal.transactions")}
                </p>
                <ul className="space-y-1.5">
                  {selectedInfo.txs.map((t) => {
                    const cat = categoryOf(t.category);
                    const Icon = cat.icon;
                    return (
                      <li key={t.id} className="flex items-center gap-3">
                        <div
                          className="tap grid h-8 w-8 place-items-center rounded-xl"
                          style={{
                            backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)`,
                          }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
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
              </div>
            ) : null}
            {!selectedInfo.bills.length && !selectedInfo.txs.length ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {tr("cal.nothing")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold",
          tone === "up" ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}