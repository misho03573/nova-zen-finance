import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Package, Activity, HardDrive, AlertTriangle, CheckCircle2, Circle, Copy, Trash2, ShieldCheck, Wrench } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova } from "@/lib/nova-store";
import { runIntegrityChecks, repairState, integrityScore } from "@/lib/integrity";
import { toast } from "sonner";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useT, fmt } from "@/lib/i18n";

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

function Diagnostics() {
  const { state, importData } = useNova();
  const confirm = useConfirm();
  const t = useT();
  const statusLabel = (s: ModuleStatus) =>
    s === "complete" ? t("diag.status.complete") : s === "preview" ? t("diag.status.preview") : t("diag.status.wip");
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

  const issues = useMemo(() => runIntegrityChecks(state), [state]);
  const health = integrityScore(issues);

  const repairAll = async () => {
    const ok = await confirm({
      title: t("integrity.confirmTitle"),
      description: t("integrity.confirmDesc"),
      confirmLabel: t("integrity.repairAll"),
      destructive: true,
    });
    if (!ok) return;
    const repaired = repairState(state, issues.map((i) => i.kind));
    if (importData(JSON.stringify(repaired))) toast.success(t("integrity.repaired"));
    else toast.error(t("integrity.repairFail"));
  };

  const copyReport = async () => {
    const report = {
      version: APP_VERSION,
      built: BUILD_TIMESTAMP,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
      language: typeof navigator !== "undefined" ? navigator.language : "n/a",
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`
          : "n/a",
      store: {
        accounts: state.accounts.length,
        transactions: state.transactions.length,
        goals: state.goals.length,
        budgets: state.budgets.length,
        subscriptions: state.subscriptions.length,
        recurring: state.recurring.length,
        liabilities: state.liabilities.length,
      },
      modules: MODULES,
      performance: perf,
      localStorage: storage,
      errors,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success(t("diag.copySuccess"));
    } catch {
      toast.error(t("diag.copyFail"));
    }
  };

  const clearErrors = () => {
    setErrors([]);
    toast.message(t("diag.errorsCleared"));
  };

  const wipeStorage = async () => {
    const ok = await confirm({
      title: t("diag.wipeTitle"),
      description: t("diag.wipeDesc"),
      confirmLabel: t("diag.wipeConfirm"),
      destructive: true,
    });
    if (!ok) return;
    try {
      localStorage.clear();
      location.reload();
    } catch {
      toast.error(t("diag.wipeFail"));
    }
  };

  return (
    <AppShell>
      <PageHeader
        subtitle={t("diag.subtitle")}
        title={t("diag.title")}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              aria-label={t("diag.copyAria")}
              className="press inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 text-xs font-medium backdrop-blur"
            >
              <Copy className="h-3.5 w-3.5" /> {t("diag.copy")}
            </button>
            <Link
              to="/settings"
              aria-label={t("action.back")}
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 px-5">
        <Metric icon={<Package className="h-4 w-4" />} label={t("diag.metric.version")} value={APP_VERSION} />
        <Metric
          icon={<Activity className="h-4 w-4" />}
          label={t("diag.metric.built")}
          value={new Date(BUILD_TIMESTAMP).toLocaleString()}
        />
        <Metric
          icon={<Database className="h-4 w-4" />}
          label={t("diag.metric.snapshot")}
          value={fmt(t("diag.snapshot"), { accounts: state.accounts.length, tx: state.transactions.length })}
        />
        <Metric
          icon={<HardDrive className="h-4 w-4" />}
          label={t("diag.metric.storage")}
          value={fmt(t("diag.storageStat"), { kb: (totalBytes / 1024).toFixed(1), n: storage.length })}
        />
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>{t("diag.section.modules")}</SectionHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          {fmt(t("diag.moduleStats"), { c: totals.complete, t: totals.total, p: totals.preview })}
        </p>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {MODULES.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="shrink-0">{statusIcon(m.status)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {(() => { const k = `diag.module.${m.id}`; const v = t(k); return v === k ? m.name : v; })()}
                </span>
                {m.notes ? (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {(() => { const k = `diag.note.${m.id}`; const v = t(k); return v === k ? m.notes : v; })()}
                  </span>
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
        <SectionHeader>{t("diag.section.perf")}</SectionHeader>
        {perf ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <PerfCell label={t("diag.perf.response")} value={`${perf.nav} ms`} />
            <PerfCell label={t("diag.perf.dom")} value={`${perf.dom} ms`} />
            <PerfCell label={t("diag.perf.load")} value={`${perf.load} ms`} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t("diag.perf.na")}</p>
        )}
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>{t("diag.section.storage")}</SectionHeader>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {storage.length === 0 ? (
            <li className="px-4 py-3 text-xs text-muted-foreground">{t("diag.storage.empty")}</li>
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
        <div className="flex items-baseline justify-between">
          <SectionHeader>{t("diag.section.errors")}</SectionHeader>
          {errors.length > 0 ? (
            <button
              onClick={clearErrors}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {t("diag.clear")}
            </button>
          ) : null}
        </div>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card/70">
          {errors.length === 0 ? (
            <li className="px-4 py-3 text-xs text-muted-foreground">{t("diag.errors.empty")}</li>
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

      <section className="mt-6 px-5">
        <SectionHeader>{t("diag.section.integrity")}</SectionHeader>
        <div className="mt-2 rounded-3xl border border-border bg-card/70 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className={health === 100 ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("integrity.score")}
            </span>
            <span className="ml-auto text-sm font-semibold tabular-nums">{health}/100</span>
          </div>
          {issues.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("integrity.clean")}</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {issues.map((i) => (
                  <li key={i.kind} className="rounded-2xl border border-border bg-background/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t(i.titleKey)}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{i.count}</span>
                      <span
                        className="shrink-0 text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: i.severity === "critical" ? "var(--destructive)" : "oklch(0.82 0.17 80)" }}
                      >
                        {t(`integrity.severity.${i.severity}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t(i.fixKey)}</p>
                  </li>
                ))}
              </ul>
              <button
                onClick={repairAll}
                className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
              >
                <Wrench className="h-4 w-4" /> {t("integrity.repairAll")}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="mt-6 px-5">
        <SectionHeader>{t("diag.section.danger")}</SectionHeader>
        <button
          onClick={wipeStorage}
          className="press mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
        >
          <Trash2 className="h-4 w-4" /> {t("diag.wipe")}
        </button>
      </section>

      <p className="mt-6 px-5 pb-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("diag.footer")}
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