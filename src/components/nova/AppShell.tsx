import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Wallet, Plus, BarChart3, Target, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tab = {
  to: "/" | "/wallet" | "/add" | "/stats" | "/goals" | "/settings";
  label: string;
  icon: typeof Home;
  primary?: boolean;
};

const tabs: Tab[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/add", label: "Add", icon: Plus, primary: true },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/goals", label: "Goals", icon: Target },
];

export function SettingsButton() {
  return (
    <Link
      to="/settings"
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground backdrop-blur transition-colors hover:bg-card"
      aria-label="Settings"
    >
      <SettingsIcon className="h-4 w-4" />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] -z-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col pb-28">
        {children}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] items-center justify-around px-4 pb-5 pt-3"
        aria-label="Primary"
      >
        <div className="flex w-full items-center justify-around rounded-full border border-border bg-card/80 px-2 py-2 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          {tabs.map((t) => {
            const active = pathname === t.to;
            const Icon = t.icon;
            if (t.primary) {
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  aria-label={t.label}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.5} />
                </Link>
              );
            }
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pb-4 pt-8">
      <div className="min-w-0">
        {subtitle ? (
          <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}