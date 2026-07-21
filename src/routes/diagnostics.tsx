import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Package, Activity, HardDrive, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova } from "@/lib/nova-store";

export const APP_VERSION = "1.0.0-rc.1";
// Baked at file evaluation time. For a real build stamp, wire `define` in vite.config.ts.
export const BUILD_TIMESTAMP: string =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: Record<string, string> }).env?.VITE_BUILD_TIME
    ? ((import.meta as { env: Record<string, string> }).env.VITE_BUILD_TIME as string)
    : new Date().toISOString();

export const Route = createFileRoute("/diagnostics")({
  head: () => ({
    meta: [
      { title: "Diagnostics · NOVA" },
      { name: "description", content: "Internal build and runtime diagnostics for NOVA." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Diagnostics,
});

type ModuleStatus = "complete" | "preview" | "wip";
type ModuleRow = { id: string; name: string; status: ModuleStatus; notes?: string };

const MODULES: ModuleRow[] = [
  { id: "home", name: "Home dashboard", status: "complete" },
  { id: "wallet", name: "Wallet & transactions", status: "complete" },
  { id: "add", name: "Add transaction", status: "complete" },
  { id: "insights", name: "AI Insights", status: "complete" },
  { id: "calendar", name: "Calendar", status: "complete" },
  { id: "stats", name: "Statistics", status: "complete" },
  { id: "goals", name: "Goals", status: "complete" },
  { id: "networth", name: "Net worth", status: "complete" },
  { id: "subscriptions", name: "Subscriptions", status: "complete" },
  { id: "automation", name: "Automation", status: "preview", notes: "Rules persist but no funds move" },
  { id: "scan", name: "Receipt scanner", status: "preview", notes: "Uses mock OCR" },
  { id: "import", name: "CSV import", status: "complete" },
  { id: "ai", name: "NOVA AI chat", status: "preview", notes: "Rule-based responses, no LLM" },
  { id: "settings", name: "Settings", status: "complete" },
  { id: "onboarding", name: "Onboarding", status: "complete" },
  { id: "biometric", name: "Face ID / Touch ID", status: "preview", notes: "Toggle only, no OS integration" },
  { id: "pin", name: "PIN lock", status: "preview", notes: "Stored, but no lock screen enforcement yet" },
  { id: "cloud", name: "Cloud sync", status: "preview", notes: "Placeholder toggle" },
  { id: "notif", name: "Push notifications", status: "preview", notes: "Toggle only, no delivery" },
  { id: "i18n", name: "Translations", status: "preview", notes: "Nav + settings only; pages remain English" },
  { id: "recurring", name: "Recurring auto-advance", status: "complete" },
];

function statusIcon(s: ModuleStatus) {
  if (s === "complete") return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (s === "preview") return <AlertTriangle className="h-3.5 w-3.5" style={{ color: "oklch(0.82 0.17 80)" }} />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function statusLabel(s: ModuleStatus) {
  return s === "complete" ? "Complete" : s === "preview" ? "Preview" : "In progress";
}

function Diagnostics() {
  const { state } = useNova();
  const [errors, setErrors] = useState<{ msg: string; at: number }[]>([]);
  const [storage, setStorage] = useState<{ key: string; bytes: number }[]>([]);
  const [perf, setPerf] = useState<{ nav: number; dom: number; load: number } | null>(null);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setErrors((prev) => [{ msg: e.message, at: Date.now() }, ...prev].slice(0, 20));
    };
    const onRej = (e: PromiseRejectionEvent) => {
      setErrors((prev) => [{ msg: String(e.reason?.message ?? e.reason), at: Date.now() }, ...prev].slice(0, 20));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRej);

    try {
      const rows: { key: string; bytes: number }[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        const v = window.localStorage.getItem(k) ?? "";
        rows.push({ key: k, bytes: new Blob([v]).size });
      }
      rows.sort((a, b) => b.bytes - a.bytes);
      setStorage(rows);
    } catch {
      /* ignore */
    }

    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        setPerf({
          nav: Math.round(nav.responseEnd - nav.startTime),
          dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          load: Math.round(nav.loadEventEnd - nav.startTime),
        });
      }
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  const totals = useMemo(() => {
    const complete = MODULES.filter((m) => m.status === "complete").length;
    const preview = MODULES.filter((m) => m.status === "preview").length;
    return { complete, preview, total: MODULES.length };
  }, []);

  const totalBytes = storage.reduce((s, r) => s + r.bytes, 0);

  return (
    <AppShell>
      <PageHeader
        subtitle="Internal · not linked from the app"
        title="Diagnostics"
        right={
          <Link
            to="/settings"
            aria-label="Back"
            className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 px-5">
        <Metric icon={<Package className="h-4 w-4" />} label="Version" value={APP_VERSION} />
        <Metric
          icon={<Activity className="h-4 w-4" />}
          label="Built"
          value={new Date(BUILD_TIMESTAMP).toLocaleString()}
        />
        <Metric
          icon={<Database className="h-4 w-4" />}
          label="Store snapshot"
          value={`${state.accounts.length} accounts · ${state.transactions.length} tx`}
        />
        <Metric
          icon={<HardDrive className="h-4 w-4" />}
          label="localStorage"
          value={`${(totalBytes / 1024).toFixed(1)} kB · ${storage.length} keys`}
        />
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>Modules</SectionHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          {totals.complete}/{totals.total} complete · {totals.preview} preview
        </p>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {MODULES.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="shrink-0">{statusIcon(m.status)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{m.name}</span>
                {m.notes ? (
                  <span className="block truncate text-[11px] text-muted-foreground">{m.notes}</span>
                ) : null}
              </span>
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  color:
                    m.status === "complete"
                      ? "var(--primary)"
                      : m.status === "preview"
                        ? "oklch(0.82 0.17 80)"
                        : "var(--muted-foreground)",
                }}
              >
                {statusLabel(m.status)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>Performance</SectionHeader>
        {perf ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <PerfCell label="Response" value={`${perf.nav} ms`} />
            <PerfCell label="DOM ready" value={`${perf.dom} ms`} />
            <PerfCell label="Loaded" value={`${perf.load} ms`} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Performance API not available.</p>
        )}
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>localStorage inspector</SectionHeader>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {storage.length === 0 ? (
            <li className="px-4 py-3 text-xs text-muted-foreground">No local data.</li>
          ) : (
            storage.map((row) => (
              <li key={row.key} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="truncate font-mono">{row.key}</span>
                <span className="shrink-0 text-muted-foreground">{(row.bytes / 1024).toFixed(2)} kB</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>Runtime errors (session)</SectionHeader>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {errors.length === 0 ? (
            <li className="px-4 py-3 text-xs text-muted-foreground">No errors captured this session.</li>
          ) : (
            errors.map((e, i) => (
              <li key={i} className="px-4 py-2 text-xs">
                <p className="truncate font-mono text-destructive">{e.msg}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <p className="mt-6 px-5 pb-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        NOVA diagnostics · Not linked from primary navigation
      </p>
    </AppShell>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card/70 p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="text-primary">{icon}</span> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function PerfCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}