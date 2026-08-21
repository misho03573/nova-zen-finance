import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home, Wallet, Plus, Sparkles, Target, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Tab = {
  to:
    | "/"
    | "/wallet"
    | "/add"
    | "/insights"
    | "/goals"
    | "/settings"
    | "/calendar"
    | "/stats"
    | "/ai"
    | "/scan"
    | "/networth"
    | "/import"
    | "/automation"
    | "/subscriptions";
  labelKey: string;
  icon: typeof Home;
  primary?: boolean;
};

const tabs: Tab[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/wallet", labelKey: "nav.wallet", icon: Wallet },
  { to: "/add", labelKey: "nav.add", icon: Plus, primary: true },
  { to: "/insights", labelKey: "nav.insights", icon: Sparkles },
  { to: "/goals", labelKey: "nav.goals", icon: Target },
];

export function SettingsButton() {
  const tr = useT();
  return (
    <Link
      to="/settings"
      className="tap grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground backdrop-blur transition-colors hover:bg-card"
      aria-label={tr("shell.settings")}
    >
      <SettingsIcon className="h-4 w-4" />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tr = useT();

  return (
    <div className="min-h-dvh-screen safe-x bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] -z-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="safe-top relative mx-auto flex min-h-dvh-screen w-full max-w-[430px] flex-col pb-nav">
        {children}
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] items-center justify-around px-4 pt-3"
        aria-label="Primary"
      >
        <div className="mb-3 flex w-full items-center justify-around rounded-full border border-border bg-card/80 px-2 py-2 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
          {tabs.map((tab) => {
            const active = pathname === tab.to;
            const Icon = tab.icon;
            const label = tr(tab.labelKey);
            if (tab.primary) {
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-label={label}
                  className="tap grid h-12 w-12 shrink-0 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.5} />
                </Link>
              );
            }
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-primary")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}


export function BackButton() {
  const router = useRouter();
  const tr = useT();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
        else router.navigate({ to: "/" });
      }}
      aria-label={tr("shell.back")}
      className="tap grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card/60 text-foreground backdrop-blur transition-colors hover:bg-card"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
}) {
  return (
    <header
      className={cn(
        "items-center gap-3 px-5 pb-4 pt-8",
        back ? "grid grid-cols-[auto_minmax(0,1fr)_auto]" : "grid grid-cols-[minmax(0,1fr)_auto]",
      )}
    >
      {back ? <BackButton /> : null}
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