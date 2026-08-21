import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  AlertTriangle,
  FileWarning,
  ShieldCheck,
  Repeat,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova } from "@/lib/nova-store";
import { useCurrency, type CurrencyCode } from "@/lib/currency";
import { toast } from "sonner";
import { useCategories, useCategoryLookup } from "@/lib/categories";
import { useCategoryName, useT, fmt } from "@/lib/i18n";
import { parseBankCsvRaw } from "@/lib/csv-import";
import {
  buildPreview,
  summarize,
  toTransactions,
  outcomeOf,
  isSelected,
  type CrossCurrencyMode,
  type ImportOutcome,
  type PreviewRow,
  type RowIssue,
} from "@/lib/import-preview";
import { runIntegrityChecks } from "@/lib/integrity";
import { EmptyState } from "@/components/nova/EmptyState";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Bank Import · NOVA" },
      { name: "description", content: "Preview, verify and import bank CSV transactions." },
      { property: "og:title", content: "Bank Import · NOVA" },
      {
        property: "og:description",
        content: "Preview, verify and import bank CSV transactions.",
      },
    ],
  }),
  component: ImportPage,
});

const SAMPLE = `date,description,amount,currency
2026-07-18,BLUE BOTTLE COFFEE #221,-6.50,USD
2026-07-18,WHOLE FOODS MKT 1029,-84.32,USD
2026-07-17,UBER *TRIP,-18.90,USD
2026-07-15,SALARY ACME INC,6200.00,USD
2026-07-14,AESOP LONDON,-142.00,GBP
2026-07-12,CON EDISON,-96.14,USD
2026-07-10,TRADER JOES #481,-52.11,USD
2026-07-10,TRADER JOES #481,-52.11,USD
2026-07-08,SHELL GAS,-0,USD`;

const MAX_ROWS = 60;

function ImportPage() {
  const { state, importTransactions } = useNova();
  const { formatIn } = useCurrency();
  const tr = useT();
  const navigate = useNavigate();
  const categoryOf = useCategoryLookup();
  const catName = useCategoryName();
  const allCategories = useCategories();

  const [csv, setCsv] = useState("");
  const [account, setAccount] = useState(state.accounts[0]?.id ?? "");
  const [crossCurrency, setCrossCurrency] = useState<CrossCurrencyMode>("block");
  const [selection, setSelection] = useState<Record<number, boolean>>({});
  const [catOverrides, setCatOverrides] = useState<Record<number, string>>({});
  const [result, setResult] = useState<ImportOutcome | null>(null);

  const accountCur = (state.accounts.find((a) => a.id === account)?.currency ??
    "USD") as CurrencyCode;

  const parsed = useMemo(() => parseBankCsvRaw(csv), [csv]);

  const rows = useMemo(
    () =>
      csv.trim()
        ? buildPreview(parsed.rows, {
            accountId: account,
            accountCurrency: accountCur,
            existing: state.transactions,
            rules: state.categoryRules,
            merchants: state.merchants,
            crossCurrency,
            categoryOverrides: catOverrides,
          })
        : [],
    [csv, parsed, account, accountCur, state.transactions, state.categoryRules, state.merchants, crossCurrency, catOverrides],
  );

  const totals = useMemo(() => summarize(rows, selection), [rows, selection]);
  const hasMismatch = rows.some((r) => r.issues.includes("currencyMismatch"));

  useEffect(() => {
    setSelection({});
    setCatOverrides({});
    setResult(null);
  }, [csv, account]);

  const postIssues = useMemo(
    () => (result ? runIntegrityChecks(state).filter((i) => i.severity === "critical") : []),
    [result, state],
  );

  const onFile = async (f: File | null) => {
    if (!f) return;
    setCsv(await f.text());
  };

  const doImport = () => {
    const txs = toTransactions(rows, selection);
    if (!txs.length) return;
    const outcome = outcomeOf(rows, selection);
    importTransactions(txs);
    setResult(outcome);
    toast.success(fmt(tr("imp.imported"), { n: txs.length }));
  };

  const issueLabel = (i: RowIssue) => tr(`imp.issue.${i}`);

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("imp.subtitle")}
        title={tr("imp.title")}
        right={
          <Link
            to="/"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="px-5">
        <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-dashed border-border bg-card/60 p-5 shadow-[var(--shadow-card)]">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Upload className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{tr("imp.upload")}</p>
            <p className="text-xs text-muted-foreground">{tr("imp.uploadDesc")}</p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          onClick={() => setCsv(SAMPLE)}
          className="mt-2 flex items-center gap-1.5 text-xs text-primary"
        >
          <FileText className="h-3.5 w-3.5" /> {tr("imp.loadSample")}
        </button>
      </section>

      <section className="mt-4 px-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {tr("imp.into")}
        </p>
        <div className="flex flex-wrap gap-2">
          {state.accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccount(a.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                account === a.id ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {a.name} · {a.currency}
            </button>
          ))}
        </div>
      </section>

      {result ? (
        <section className="mt-4 px-5">
          <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold">{tr("imp.resultTitle")}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>{fmt(tr("imp.resImported"), { n: result.imported })}</li>
              <li>{fmt(tr("imp.resDupes"), { n: result.skippedDuplicates })}</li>
              <li>{fmt(tr("imp.resInvalid"), { n: result.skippedInvalid })}</li>
              <li>{fmt(tr("imp.resExcluded"), { n: result.excluded })}</li>
            </ul>
            <div className="mt-3 flex items-center gap-2 text-xs">
              {postIssues.length === 0 ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="h-4 w-4" /> {tr("imp.integrityOk")}
                </span>
              ) : (
                <Link to="/diagnostics" className="flex items-center gap-1.5 text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  {fmt(tr("imp.integrityIssues"), { n: postIssues.length })}
                </Link>
              )}
            </div>
            <button
              onClick={() => navigate({ to: "/wallet" })}
              className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              {tr("imp.done")}
            </button>
          </div>
        </section>
      ) : null}

      {!result && csv.trim() && rows.length === 0 ? (
        <section className="mt-4 px-5">
          <EmptyState
            icon={<FileWarning className="h-6 w-6" />}
            title={tr("imp.noRows")}
            description={tr("imp.noRowsDesc")}
          />
        </section>
      ) : null}

      {!result && rows.length > 0 ? (
        <section className="mt-4 px-5">
          <div className="rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold">
              {fmt(tr("imp.rowsDetected"), { n: totals.total })}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <li>{fmt(tr("imp.validN"), { n: totals.valid })}</li>
              <li>{fmt(tr("imp.dupN"), { n: totals.duplicates })}</li>
              <li>{fmt(tr("imp.autoCatN"), { n: totals.autoCategorized })}</li>
              <li>{fmt(tr("imp.reviewN"), { n: totals.needsReview })}</li>
              <li>{fmt(tr("imp.invalidN"), { n: totals.invalid })}</li>
              <li>{fmt(tr("imp.selectedN"), { n: totals.selected })}</li>
            </ul>
            {parsed.columns ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {fmt(tr("imp.detected"), {
                  date: parsed.columns.date,
                  description: parsed.columns.description,
                  amount: parsed.columns.amount,
                })}
              </p>
            ) : null}
            {hasMismatch ? (
              <label className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-background/40 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={crossCurrency === "convert"}
                  onChange={(e) => setCrossCurrency(e.target.checked ? "convert" : "block")}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5" />
                  {fmt(tr("imp.convertToggle"), { cur: accountCur })}
                </span>
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setSelection(Object.fromEntries(rows.filter((r) => r.valid).map((r) => [r.index, true])))
                }
                className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium"
              >
                {tr("imp.selectAllValid")}
              </button>
              <button
                onClick={() => setSelection(Object.fromEntries(rows.map((r) => [r.index, false])))}
                className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium"
              >
                {tr("imp.deselectAll")}
              </button>
              <button
                onClick={() =>
                  setSelection(
                    Object.fromEntries(rows.map((r) => [r.index, r.valid && r.dupe === "none"])),
                  )
                }
                className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium"
              >
                {tr("imp.skipDuplicates")}
              </button>
            </div>
          </div>

          <ul className="mt-3 divide-y divide-border rounded-3xl border border-border bg-card/70 shadow-[var(--shadow-card)]">
            {rows.slice(0, MAX_ROWS).map((r: PreviewRow) => {
              const cat = categoryOf(r.category);
              const Icon = cat.icon;
              const on = isSelected(r, selection);
              return (
                <li key={r.index} className={`px-4 py-3 ${on ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={!r.valid}
                      checked={on}
                      onChange={() => setSelection((p) => ({ ...p, [r.index]: !on }))}
                      aria-label={tr("imp.include")}
                      className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <div
                      className="grid h-8 w-8 place-items-center rounded-xl"
                      style={{ backgroundColor: `color-mix(in oklab, ${cat.color} 22%, transparent)` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.merchantLabel}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {fmt(tr("imp.raw"), { raw: r.raw.title || "—" })}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.date ? new Date(r.date).toLocaleDateString() : r.raw.date || "—"}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${(r.amount ?? 0) > 0 ? "text-primary" : ""}`}>
                      {r.amount !== null
                        ? formatIn(r.amount, r.currency)
                        : r.raw.amount || "—"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
                    <select
                      value={r.category}
                      onChange={(e) =>
                        setCatOverrides((p) => ({ ...p, [r.index]: e.target.value }))
                      }
                      aria-label={tr("imp.category")}
                      className="rounded-full border border-border bg-background/60 px-2 py-1 text-[11px]"
                    >
                      {allCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {catName(c.id, c.name, c.builtin)}
                        </option>
                      ))}
                    </select>
                    {r.categorySource === "rule" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {tr("imp.byRule")}
                      </span>
                    ) : null}
                    {r.categorySource === "manual" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {tr("imp.locked")}
                      </span>
                    ) : null}
                    {r.dupe !== "none" ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        {r.dupe === "exact" ? tr("imp.dupeExact") : tr("imp.dupeLikely")}
                      </span>
                    ) : null}
                    {r.converted ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        {fmt(tr("imp.convertedFrom"), {
                          amount: formatIn(r.sourceAmount ?? 0, r.sourceCurrency),
                        })}
                      </span>
                    ) : null}
                    {r.issues.map((i) => (
                      <span
                        key={i}
                        className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive"
                      >
                        {issueLabel(i)}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > MAX_ROWS ? (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {fmt(tr("imp.showingFirst"), { n: MAX_ROWS, total: rows.length })}
            </p>
          ) : null}

          <button
            disabled={totals.selected === 0}
            onClick={doImport}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Check className="h-4 w-4" /> {fmt(tr("imp.importBtn"), { n: totals.selected })}
          </button>
        </section>
      ) : null}
    </AppShell>
  );
}
