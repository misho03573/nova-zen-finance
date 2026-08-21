import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Sparkles,
  Settings as SettingsIcon,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  PiggyBank,
  TrendingUp,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { NotificationBell } from "@/components/nova/NotificationBell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { AnimatedNumber } from "@/components/nova/AnimatedNumber";
import { useCategoryLookup } from "@/lib/categories";
import { useCategoryName, useT, useDateLabels, useLocale, fmt } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useNova,
  monthlyTotals,
  formatTxDate,
  savingsRate,
  cashflowByRange,
  useDisplayState,
  txCurrency,
  netWorthBreakdown,
  computeFinancialScore,
  type ScoreBreakdown,
} from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NOVA — Your money, at a glance" },
      {
        name: "description",
        content: "Track spending, forecast cash flow and hit your savings goals — all in a calm, beautifully designed dashboard.",
      },
      { property: "og:title", content: "NOVA — Your money, at a glance" },
      {
        property: "og:description",
        content: "Track spending, forecast cash flow and hit your savings goals — all in a calm, beautifully designed dashboard.",
      },
      { property: "og:url", content: "https://nova-zen-finance.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://nova-zen-finance.lovable.app/" }],
  }),
  component: Home,
});

function Home() {
  const { state } = useNova();
  const display = useDisplayState();
  const { format, formatIn } = useCurrency();
  const { fullName, user } = useAuth();
  const categoryOf = useCategoryLookup();
  const catName = useCategoryName();
  const tr = useT();
  const dateLabels = useDateLabels();
  const locale = useLocale();
  void catName;
  const hide = !!state.settings.hideBalances;
  const nw = netWorthBreakdown(display);
  const netWorth = nw.net;
  const { income: monthlyIncome, expenses: monthlyExpenses } = monthlyTotals(
    display.transactions,
  );
  const rate = savingsRate(monthlyIncome, monthlyExpenses);
  const health = computeFinancialScore(display);
  const week = cashflowByRange(display.transactions, "week", locale);
  const spentWeek = week.reduce((s, d) => s + d.expense, 0);
  // Upcoming = recurring transactions + active subscriptions, de-duplicated
  // by name so a subscription mirrored as a recurring item appears once.
  const upcoming = (() => {
    const norm = (s: string) => s.trim().toLowerCase();
    const seen = new Set(state.recurring.map((r) => norm(r.title)));
    const items = state.recurring.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      nextDate: r.nextDate,
      amount: r.amount,
      currency:
        r.currency ?? state.accounts.find((a) => a.id === r.accountId)?.currency ?? "USD",
      meta: tr(`add.recurring.${r.frequency}`),
    }));
    for (const s of state.subscriptions) {
      if ((s.status ?? "active") !== "active") continue;
      const key = norm(s.merchant || s.name);
      if (seen.has(key) || seen.has(norm(s.name))) continue;
      seen.add(key);
      items.push({
        id: s.id,
        title: s.name,
        category: s.category,
        nextDate: s.nextDate,
        amount: -Math.abs(s.amount),
        currency:
          s.currency ?? state.accounts.find((a) => a.id === s.accountId)?.currency ?? "USD",
        meta: tr("home.upcoming.subscription"),
      });
    }
    return items
      .sort((a, b) => +new Date(a.nextDate) - +new Date(b.nextDate))
      .slice(0, 3);
  })();
  const recent = [...state.transactions]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 4);
  const primaryAccount = state.accounts[0];
  const displayName = fullName || (user ? tr("home.you") : tr("home.guest"));
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return tr("home.morning");
    if (h < 18) return tr("home.afternoon");
    return tr("home.evening");
  })();
  return (
    <AppShell>
      <PageHeader
        subtitle={greeting}
        title={displayName}
        right={
          <div className="flex items-center gap-2">
            <CurrencyPicker variant="chip" />
            <NotificationBell />
            <Link
              to="/calendar"
              aria-label={tr("shell.calendar")}
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur transition-colors hover:bg-card"
            >
              <CalendarDays className="h-4 w-4" />
            </Link>
            <Link
              to="/settings"
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur transition-colors hover:bg-card"
              aria-label={tr("shell.settings")}
            >
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="animate-rise-in px-5" style={{ animationDelay: "40ms" }}>
        <ScoreCard health={health} />
      </section>

      <section className="animate-rise-in mt-6 px-5" style={{ animationDelay: "120ms" }}>
        <NetWorthCard
          netWorth={netWorth}
          income={monthlyIncome}
          expenses={monthlyExpenses}
          rate={rate}
          gradient={primaryAccount?.gradient ?? "var(--gradient-wallet)"}
          hide={hide}
          breakdown={nw}
        />
      </section>

      <section className="animate-rise-in mt-6 px-5" style={{ animationDelay: "200ms" }}>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon={<Plus className="h-4 w-4" />} label={tr("home.add")} to="/add" primary />
          <QuickAction icon={<ArrowUpRight className="h-4 w-4" />} label={tr("home.send")} to="/wallet" />
          <QuickAction icon={<ArrowDownRight className="h-4 w-4" />} label={tr("home.request")} to="/wallet" />
          <QuickAction icon={<Sparkles className="h-4 w-4" />} label={tr("home.insights")} to="/insights" />
        </div>
      </section>

      <section className="animate-rise-in mt-6 px-5" style={{ animationDelay: "260ms" }}>
        <Link
          to="/review"
          className="press mb-3 flex items-center gap-3 rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary"
            style={{ background: "var(--gradient-card)" }}
          >
            <CalendarRange className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{tr("rev.open")}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {tr("rev.openDesc")}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <MiniCard
            icon={<PiggyBank className="h-4 w-4" />}
            label={tr("home.savingsRate")}
            value={`${Math.round(rate * 100)}%`}
            hint={rate >= 0.2 ? tr("home.savingsRate.excellent") : rate >= 0.1 ? tr("home.savingsRate.ontrack") : tr("home.savingsRate.push")}
          />
          <MiniCard
            icon={<TrendingUp className="h-4 w-4" />}
            label={tr("home.ivex")}
            value={format(monthlyIncome - monthlyExpenses, { signed: true })}
            hint={`${format(monthlyIncome)} · −${format(monthlyExpenses).replace("−", "")}`}
          />
        </div>
      </section>

      <section className="animate-rise-in mt-8 px-5" style={{ animationDelay: "320ms" }}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tr("home.thisWeek")}</h2>
          <Link to="/stats" className="text-xs text-muted-foreground hover:text-foreground">
            {tr("home.seeAll")}
          </Link>
        </div>
        <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{tr("home.spent")}</p>
              <AnimatedNumber
                value={spentWeek}
                format={(n) => format(n)}
                className="text-2xl font-semibold tracking-tight"
              />
            </div>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {tr("home.days7")}
            </span>
          </div>
          <div className="flex h-24 items-end gap-2">
            {week.map((d, i) => {
              const max = Math.max(1, ...week.map((x) => x.expense));
              const h = Math.max(6, (d.expense / max) * 100);
              return (
                <div key={d.m} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="animate-bar-grow w-full rounded-md"
                    style={{
                      height: `${h}%`,
                      background: "var(--gradient-primary)",
                      opacity: 0.85,
                      animationDelay: `${360 + i * 60}ms`,
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.m}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="animate-rise-in mt-8 px-5" style={{ animationDelay: "420ms" }}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tr("home.upcoming")}</h2>
          <span className="text-xs text-muted-foreground">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            {tr("home.noUpcoming")}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
            {upcoming.map((r, i) => {
              const cat = categoryOf(r.category);
              const Icon = cat.icon;
              const days = Math.max(
                0,
                Math.ceil((+new Date(r.nextDate) - Date.now()) / (24 * 3600 * 1000)),
              );
              return (
                <li
                  key={r.id}
                  className="animate-rise-in flex items-center gap-3 px-4 py-3"
                  style={{ animationDelay: `${480 + i * 60}ms` }}
                >
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                    style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: cat.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <CalendarClock className="mr-1 inline h-3 w-3" />
                      {tr("home.in")} {days} {days === 1 ? tr("home.day") : tr("home.days")} · {r.meta}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatIn(r.amount, r.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="animate-rise-in mt-8 px-5" style={{ animationDelay: "520ms" }}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">{tr("home.recent")}</h2>
          <Link to="/wallet" className="text-xs text-muted-foreground hover:text-foreground">
            {tr("home.viewAll")}
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
          {recent.map((t, i) => {
            const cat = categoryOf(t.category);
            const Icon = cat.icon;
            const positive = t.amount > 0;
            return (
              <li
                key={t.id}
                className="animate-rise-in flex items-center gap-3 px-4 py-3"
                style={{ animationDelay: `${580 + i * 60}ms` }}
              >
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                  style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color: cat.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatTxDate(t.date, dateLabels)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    positive ? "text-primary" : "text-foreground"
                  }`}
                >
                  {formatIn(t.amount, txCurrency(t, state.accounts))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}

function MiniCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="text-primary">{icon}</span> {label}
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ScoreCard({ health }: { health: ScoreBreakdown }) {
  const { score, statusKey, explanationKey, explanationParams, chips } = health;
  const tr = useT();
  const max = 900;
  const pct = Math.min(1, score / 1000);
  void max;
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
      style={{ background: "var(--gradient-card)" }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-50 blur-3xl"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <div className="relative h-[110px] w-[110px] shrink-0">
          <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
            <circle cx="55" cy="55" r={r} stroke="var(--border)" strokeWidth="8" fill="none" />
            <circle
              cx="55"
              cy="55"
              r={r}
              stroke="url(#novaScore)"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
            <defs>
              <linearGradient id="novaScore" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="oklch(0.82 0.18 155)" />
                <stop offset="100%" stopColor="oklch(0.75 0.15 200)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <AnimatedNumber
                value={score}
                format={(n) => Math.round(n).toString()}
                duration={900}
                className="text-2xl font-semibold tracking-tight"
              />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tr("home.score")}</p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {tr("home.financialHealth")}
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight text-foreground">
            {tr(statusKey)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmt(tr(explanationKey), explanationParams ?? {})}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Chip key={c.key}>{fmt(tr(c.key), c.params ?? {})}</Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
      {children}
    </span>
  );
}

function NetWorthCard({
  netWorth,
  income,
  expenses,
  rate,
  gradient,
  hide,
  breakdown,
}: {
  netWorth: number;
  income: number;
  expenses: number;
  rate: number;
  gradient: string;
  hide?: boolean;
  breakdown: ReturnType<typeof netWorthBreakdown>;
}) {
  const { format, currency } = useCurrency();
  const tr = useT();
  return (
    <div
      className="press relative overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
      style={{ background: gradient }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 animate-float-slow rounded-full bg-white/10 blur-3xl" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">{tr("home.netWorth")}</p>
        <Dialog>
          <DialogTrigger asChild>
            <button
              aria-label={tr("nw.breakdown.open")}
              className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/80 transition-colors hover:bg-white/10"
            >
              {tr("nw.allAccounts")} · {currency.code}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">{tr("nw.breakdown.title")}</DialogTitle>
            </DialogHeader>
            <ul className="space-y-1 text-sm">
              <BreakdownRow label={tr("nw.cash")} value={format(breakdown.cash)} />
              <BreakdownRow label={tr("nw.bank")} value={format(breakdown.bank)} />
              <BreakdownRow label={tr("nw.investments")} value={format(breakdown.invest)} />
              <BreakdownRow label={tr("nw.crypto")} value={format(breakdown.crypto)} />
              <BreakdownRow label={tr("nw.assets")} value={format(breakdown.assets)} strong />
              <BreakdownRow
                label={tr("nw.liabilities")}
                value={format(-breakdown.liab)}
                tone="negative"
              />
              <BreakdownRow label={tr("nw.final")} value={format(breakdown.net)} strong />
            </ul>
          </DialogContent>
        </Dialog>
      </div>
      {hide ? (
        <span className="mt-2 block select-none text-4xl font-semibold tracking-tight">••••••</span>
      ) : (
        <AnimatedNumber
          value={netWorth}
          format={(n) => format(n)}
          duration={900}
          className="mt-2 block text-4xl font-semibold tracking-tight"
        />
      )}
      <p className="mt-1 text-[11px] uppercase tracking-widest text-white/60">
        {tr("home.savingsRate")} · {Math.round(rate * 100)}%
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat
          label={tr("home.income")}
          value={hide ? "••••" : format(income, { signed: true })}
          tone="up"
        />
        <MiniStat
          label={tr("home.expenses")}
          value={hide ? "••••" : format(-expenses)}
          tone="down"
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" }) {
  return <MiniStatInner label={label} value={value} tone={tone} />;
}

function BreakdownRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "negative";
}) {
  return (
    <li
      className={`flex items-center justify-between rounded-2xl px-3 py-2 ${
        strong ? "bg-muted/50 font-semibold" : ""
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "negative" ? "text-destructive" : ""}>{value}</span>
    </li>
  );
}

function MiniStatInner({ label, value, tone }: { label: string; value: string; tone: "up" | "down" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/70">
        {tone === "up" ? (
          <ArrowDownRight className="h-3 w-3 rotate-180" />
        ) : (
          <ArrowUpRight className="h-3 w-3 rotate-180" />
        )}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  to,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  to: LinkProps["to"];
  primary?: boolean;
}) {
  return (
    <Link to={to} className="press flex flex-col items-center gap-1.5">
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl border border-border shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
        style={
          primary
            ? { background: "var(--gradient-primary)", color: "var(--primary-foreground)" }
            : { background: "var(--gradient-card)" }
        }
      >
        {icon}
      </span>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </Link>
  );
}
