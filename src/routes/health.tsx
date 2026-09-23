import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileWarning,
  Link2Off,
  Lock,
  RefreshCw,
  Tag,
  Wallet as WalletIcon,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { EmptyState } from "@/components/nova/EmptyState";
import { useDisplayState, useNova } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";
import { useT, fmt } from "@/lib/i18n";
import {
  DUP_WINDOW_DAYS,
  OUTLIER_FACTOR,
  STALE_DAYS,
  scanDataHealth,
  type HealthConfidence,
  type HealthFinding,
  type HealthKind,
} from "@/lib/data-health";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/health")({
  head: () => ({
    meta: [
      { title: "Data Health · NOVA" },
      {
        name: "description",
        content:
          "Review-only checks over your own records: possible duplicates, missing details, unusual amounts and stale scheduled items.",
      },
      { property: "og:title", content: "Data Health · NOVA" },
      {
        property: "og:description",
        content: "A private, read-only review of your NOVA records. Nothing is changed, merged or deleted.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HealthPage,
});

const KIND_ICON: Record<HealthKind, typeof Copy> = {
  duplicate: Copy,
  incomplete: FileWarning,
  uncategorized: Tag,
  outlier: AlertTriangle,
  orphan_ref: Link2Off,
  stale_schedule: CalendarClock,
};

const CONF_TONE: Record<HealthConfidence, string> = {
  high: "bg-rose-500/12 text-rose-300 border-rose-500/25",
  medium: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  low: "bg-sky-500/12 text-sky-300 border-sky-500/25",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function FindingRow({ f }: { f: HealthFinding }) {
  const tr = useT();
  const { format } = useCurrency();
  const dateLabel = f.date ? new Date(f.date).toLocaleDateString() : null;
  const valid = dateLabel && dateLabel !== "Invalid Date" ? dateLabel : null;

  return (
    <li className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{f.label || tr("dh.noLabel")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt(tr(f.reasonKey), {
              ...(f.reasonParams ?? {}),
              median:
                f.reasonParams && typeof f.reasonParams.median === "number"
                  ? format(f.reasonParams.median)
                  : "",
            })}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                CONF_TONE[f.confidence],
              )}
            >
              {tr(`dh.conf.${f.confidence}`)}
            </span>
            {valid ? <span className="text-[11px] text-muted-foreground">{valid}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {f.amount !== undefined ? (
            <span className="text-sm font-semibold tracking-tight">{format(f.amount)}</span>
          ) : null}
          <Link
            to={f.link}
            className="press inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border px-3 text-[11px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tr("dh.review")}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function HealthPage() {
  const { state } = useNova();
  const display = useDisplayState();
  const tr = useT();
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState<HealthKind | null>(null);

  const categoryIds = useMemo(() => state.categories.map((c) => c.id), [state.categories]);

  const report = useMemo(() => {
    try {
      return scanDataHealth({
        transactions: display.transactions,
        accounts: display.accounts,
        recurring: display.recurring,
        subscriptions: display.subscriptions,
        categoryIds,
        now: Date.now(),
      });
    } catch {
      // A scan failure must stay contained: show the error state, change nothing.
      return null;
    }
    // `nonce` forces an in-memory recompute when the user taps Refresh.
  }, [display.transactions, display.accounts, display.recurring, display.subscriptions, categoryIds, nonce]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
    setOpen(null);
  }, []);

  const header = (
    <PageHeader back subtitle={tr("dh.subtitle")} title={tr("dh.title")} right={<CurrencyPicker />} />
  );

  if (!report) {
    return (
      <AppShell>
        {header}
        <section className="px-5">
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title={tr("dh.error.title")}
            description={tr("dh.error.desc")}
          />
          <button
            onClick={refresh}
            className="press mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {tr("dh.refresh")}
          </button>
        </section>
      </AppShell>
    );
  }

  const nothingToScan =
    report.scanned.transactions === 0 && report.scanned.recurring === 0 && report.scanned.subscriptions === 0;

  return (
    <AppShell>
      {header}

      <section className="px-5">
        <div
          className="rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0" role="status" aria-live="polite">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {tr("dh.findings")}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{report.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(tr("dh.scanned"), {
                  tx: report.scanned.transactions,
                  items: report.scanned.recurring + report.scanned.subscriptions,
                })}
              </p>
              {report.skipped > 0 ? (
                <p className="mt-1 text-xs text-amber-400">
                  {fmt(tr("dh.skipped"), { n: report.skipped })}
                </p>
              ) : null}
            </div>
            <button
              onClick={refresh}
              aria-label={tr("dh.refresh")}
              className="press inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-full border border-border px-4 text-xs font-semibold sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {tr("dh.refresh")}
            </button>
          </div>
        </div>
      </section>

      <section className="px-5 pt-4">
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{tr("dh.privacy.title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tr("dh.privacy.body")}</p>
          </div>
        </div>
      </section>

      {nothingToScan ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<WalletIcon className="h-6 w-6" />}
            title={tr("dh.empty.title")}
            description={tr("dh.empty.desc")}
            ctaLabel={tr("nav.wallet")}
            ctaTo="/wallet"
          />
        </section>
      ) : report.total === 0 ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={tr("dh.clear.title")}
            description={tr("dh.clear.desc")}
          />
        </section>
      ) : (
        <section className="space-y-3 px-5 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label={tr("dh.stat.groups")} value={String(report.groups.length)} />
            <Stat
              label={tr("dh.stat.checked")}
              value={new Date(report.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            />
          </div>

          {report.groups.map((g) => {
            const Icon = KIND_ICON[g.kind];
            const expanded = open === g.kind;
            return (
              <div key={g.kind} className="rounded-2xl border border-border bg-card/70 backdrop-blur">
                <button
                  onClick={() => setOpen(expanded ? null : g.kind)}
                  aria-expanded={expanded}
                  aria-controls={`dh-panel-${g.kind}`}
                  className="press grid min-h-[56px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{tr(`dh.kind.${g.kind}`)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {tr(`dh.kindDesc.${g.kind}`)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                    {g.findings.length}
                  </span>
                </button>
                {expanded ? (
                  <ul id={`dh-panel-${g.kind}`} className="space-y-2 px-4 pb-4">
                    {g.findings.map((f) => (
                      <FindingRow key={f.id} f={f} />
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <section className="px-5 pt-4">
        <div className="rounded-2xl border border-border bg-card/50 p-4 text-xs text-muted-foreground">
          <p>
            {fmt(tr("dh.rules"), {
              dupDays: DUP_WINDOW_DAYS,
              factor: OUTLIER_FACTOR,
              staleDays: STALE_DAYS,
            })}
          </p>
          <p className="mt-2">{tr("dh.disclaimer")}</p>
        </div>
      </section>
    </AppShell>
  );
}
