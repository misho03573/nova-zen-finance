import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowDownRight, Bell, Plus, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import {
  balance,
  cards,
  financialScore,
  monthlyExpenses,
  monthlyIncome,
  transactions,
  categoryOf,
  formatMoney,
  spendingByDay,
} from "@/lib/nova-data";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <AppShell>
      <PageHeader
        subtitle="Good morning"
        title="Alex Morgan"
        right={
          <button
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground backdrop-blur"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        }
      />

      <section className="px-5">
        <ScoreCard score={financialScore} />
      </section>

      <section className="mt-6 px-5">
        <BalanceCard balance={balance} income={monthlyIncome} expenses={monthlyExpenses} />
      </section>

      <section className="mt-6 px-5">
        <div className="grid grid-cols-4 gap-3">
          <QuickAction icon={<Plus className="h-4 w-4" />} label="Add" to="/add" primary />
          <QuickAction icon={<ArrowUpRight className="h-4 w-4" />} label="Send" to="/wallet" />
          <QuickAction icon={<ArrowDownRight className="h-4 w-4" />} label="Request" to="/wallet" />
          <QuickAction icon={<Sparkles className="h-4 w-4" />} label="Invest" to="/stats" />
        </div>
      </section>

      <section className="mt-8 px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">This week</h2>
          <Link to="/stats" className="text-xs text-muted-foreground hover:text-foreground">
            See all
          </Link>
        </div>
        <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Spent</p>
              <p className="text-2xl font-semibold tracking-tight">$593.20</p>
            </div>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              −12% vs last
            </span>
          </div>
          <div className="flex h-24 items-end gap-2">
            {spendingByDay.map((d) => {
              const max = Math.max(...spendingByDay.map((x) => x.value));
              const h = Math.max(8, (d.value / max) * 100);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-md"
                    style={{
                      height: `${h}%`,
                      background: "var(--gradient-primary)",
                      opacity: 0.85,
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-8 px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent</h2>
          <Link to="/wallet" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <ul className="divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
          {transactions.slice(0, 5).map((t) => {
            const cat = categoryOf(t.category);
            const Icon = cat.icon;
            const positive = t.amount > 0;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                  style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color: cat.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.date}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    positive ? "text-primary" : "text-foreground"
                  }`}
                >
                  {formatMoney(t.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}

function ScoreCard({ score }: { score: number }) {
  const max = 900;
  const pct = Math.min(1, score / max);
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
      style={{ background: "var(--gradient-card)" }}
    >
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
              <p className="text-2xl font-semibold tracking-tight">{score}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">score</p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Financial health
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight text-foreground">Excellent</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You're saving 22% of income and spending is on track.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>Low spend</Chip>
            <Chip>On budget</Chip>
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

function BalanceCard({
  balance,
  income,
  expenses,
}: {
  balance: number;
  income: number;
  expenses: number;
}) {
  const primary = cards[0];
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 p-5 text-white shadow-[var(--shadow-elevated)]"
      style={{ background: primary.gradient }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">Total balance</p>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/80">
          {primary.brand}
        </span>
      </div>
      <p className="mt-2 text-4xl font-semibold tracking-tight">
        ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Income" value={`+$${income.toLocaleString()}`} tone="up" />
        <MiniStat
          label="Expenses"
          value={`−$${expenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          tone="down"
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" }) {
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
  to: "/" | "/wallet" | "/add" | "/stats" | "/goals";
  primary?: boolean;
}) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5">
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl border border-border shadow-[var(--shadow-card)]"
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
