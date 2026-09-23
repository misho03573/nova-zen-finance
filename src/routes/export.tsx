import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileJson,
  FileSpreadsheet,
  Lock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { EmptyState } from "@/components/nova/EmptyState";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useNova } from "@/lib/nova-store";
import { useT, fmt } from "@/lib/i18n";
import {
  CSV_SECTIONS,
  EXPORT_SECTIONS,
  buildCsvFiles,
  buildJsonArchive,
  countSkipped,
  sectionCounts,
  type ExportFile,
  type ExportSection,
} from "@/lib/data-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Data Export · NOVA" },
      {
        name: "description",
        content:
          "Download a private copy of your own NOVA records as CSV or JSON. The file is created on your device and sent nowhere.",
      },
      { property: "og:title", content: "Data Export · NOVA" },
      {
        property: "og:description",
        content: "Choose exactly what to include and download it locally. No upload, no sharing, no copy kept.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportPage,
});

type Format = "csv" | "json";

/** Triggers a purely local download; no copy is kept or uploaded. */
function downloadFile(file: ExportFile) {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    a.click();
  } finally {
    // Release immediately: nothing about this export stays in memory.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function ExportPage() {
  const { state } = useNova();
  const tr = useT();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [format, setFormat] = useState<Format>("json");
  const [selected, setSelected] = useState<ExportSection[]>([...EXPORT_SECTIONS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    try {
      return sectionCounts(state);
    } catch {
      return null;
    }
  }, [state]);

  const available = useMemo(
    () => (format === "csv" ? EXPORT_SECTIONS.filter((s) => CSV_SECTIONS.includes(s)) : [...EXPORT_SECTIONS]),
    [format],
  );

  const active = useMemo(() => selected.filter((s) => available.includes(s)), [selected, available]);
  const totalRecords = useMemo(
    () => (counts ? active.reduce((n, s) => n + (counts[s] ?? 0), 0) : 0),
    [counts, active],
  );
  const skipped = useMemo(() => {
    try {
      return countSkipped(state, active);
    } catch {
      return 0;
    }
  }, [state, active]);

  const toggle = useCallback((s: ExportSection) => {
    setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }, []);

  const selectAll = useCallback(() => setSelected([...EXPORT_SECTIONS]), []);
  const selectNone = useCallback(() => setSelected([]), []);

  const run = useCallback(async () => {
    if (active.length === 0 || busy) return;
    const ok = await confirm({
      title: tr("ex.confirm.title"),
      description: fmt(tr("ex.confirm.desc"), {
        count: active.length,
        format: format.toUpperCase(),
      }),
      confirmLabel: tr("ex.confirm.cta"),
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      if (format === "json") {
        downloadFile(buildJsonArchive(state, { sections: active, now }).file);
      } else {
        const files = buildCsvFiles(state, { sections: active, now });
        if (files.length === 0) throw new Error("empty");
        files.forEach((f, i) => setTimeout(() => downloadFile(f), i * 300));
      }
      toast.success(tr("ex.ok"));
    } catch {
      setError(tr("ex.err.desc"));
      toast.error(tr("ex.err.title"));
    } finally {
      setBusy(false);
    }
  }, [active, busy, confirm, format, state, tr]);

  const nothing = counts && EXPORT_SECTIONS.every((s) => (counts[s] ?? 0) === 0);

  return (
    <AppShell>
      <PageHeader
        back
        subtitle={tr("ex.subtitle")}
        title={tr("ex.title")}
        right={
          <button
            onClick={() => navigate({ to: "/settings" })}
            aria-label={tr("ex.close")}
            className="press grid h-10 w-10 place-items-center rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      />

      <section className="px-5">
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-card/70 p-3 backdrop-blur">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{tr("ex.privacy.title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tr("ex.privacy.body")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tr("ex.privacy.care")}</p>
          </div>
        </div>
      </section>

      {!counts || nothing ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<Download className="h-6 w-6" />}
            title={tr("ex.empty.title")}
            description={tr("ex.empty.desc")}
            ctaLabel={tr("nav.wallet")}
            ctaTo="/wallet"
          />
        </section>
      ) : (
        <>
          <section className="px-5 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {tr("ex.format")}
            </p>
            <div role="radiogroup" aria-label={tr("ex.format")} className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["json", "csv"] as Format[]).map((f) => {
                const on = format === f;
                const Icon = f === "json" ? FileJson : FileSpreadsheet;
                return (
                  <button
                    key={f}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "press grid min-h-[56px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary/50 bg-primary/10" : "border-border bg-card/70",
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{tr(`ex.fmt.${f}`)}</span>
                      <span className="block text-xs text-muted-foreground">{tr(`ex.fmtDesc.${f}`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="px-5 pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {tr("ex.included")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="press min-h-[36px] rounded-full border border-border px-3 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("ex.all")}
                </button>
                <button
                  onClick={selectNone}
                  className="press min-h-[36px] rounded-full border border-border px-3 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tr("ex.none")}
                </button>
              </div>
            </div>

            <ul className="mt-2 space-y-2">
              {EXPORT_SECTIONS.map((s) => {
                const usable = available.includes(s);
                const on = usable && selected.includes(s);
                return (
                  <li key={s}>
                    <button
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={!usable}
                      disabled={!usable}
                      onClick={() => toggle(s)}
                      className={cn(
                        "press grid min-h-[56px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary/50 bg-primary/10" : "border-border bg-card/70",
                        !usable && "opacity-45",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-lg border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {on ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{tr(`ex.sec.${s}`)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {usable ? tr(`ex.secDesc.${s}`) : tr("ex.jsonOnly")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                        {counts[s]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="px-5 pt-4">
            <div className="rounded-2xl border border-border bg-card/50 p-4 text-xs text-muted-foreground">
              <p>{fmt(tr("ex.summary"), { records: totalRecords, sections: active.length })}</p>
              {skipped > 0 ? <p className="mt-1 text-amber-400">{fmt(tr("ex.skipped"), { n: skipped })}</p> : null}
              <p className="mt-2">{tr("ex.excluded")}</p>
            </div>
          </section>

          {error ? (
            <section className="px-5 pt-4">
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{tr("ex.err.title")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-2 px-5 pt-4">
            <button
              onClick={run}
              disabled={active.length === 0 || busy}
              className="press inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy ? tr("ex.working") : tr("ex.download")}
            </button>
            <button
              onClick={() => navigate({ to: "/settings" })}
              className="press inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tr("ex.cancel")}
            </button>
          </section>
        </>
      )}
    </AppShell>
  );
}
