import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Image as ImageIcon, Loader2, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova } from "@/lib/nova-store";
import { useCategories, iconRegistry } from "@/lib/categories";
import { useT, useCategoryName, fmt } from "@/lib/i18n";
import { useCurrency, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { scanReceipt } from "@/lib/receipt-scan.functions";
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  validateReceiptFile,
  type ReceiptDraft,
} from "@/lib/receipt-core";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan receipt · NOVA" },
      { name: "description", content: "Turn a receipt photo into a reviewable NOVA transaction." },
      { property: "og:title", content: "Scan receipt · NOVA" },
      { property: "og:description", content: "Turn a receipt photo into a reviewable NOVA transaction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

type Phase = "idle" | "ready" | "working" | "review";

function ScanPage() {
  const navigate = useNavigate();
  const { state, addTransaction } = useNova();
  const { formatIn } = useCurrency();
  const t = useT();
  const catName = useCategoryName();
  const expenseCats = useCategories("expense");

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? "");

  const account = state.accounts.find((a) => a.id === accountId);
  const accountCurrency = (account?.currency ?? "USD") as CurrencyCode;
  const categoryIds = useMemo(() => expenseCats.map((c) => c.id), [expenseCats]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const clearImage = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setDraft(null);
    setError(null);
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const onPick = (picked: File | undefined) => {
    if (!picked) return;
    const issue = validateReceiptFile(picked);
    if (issue) {
      setError(t(`scan.err.${issue}`));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setDraft(null);
    setError(null);
    setPhase("ready");
  };

  const readAsDataUrl = (input: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(input);
    });

  const extract = async () => {
    if (!file || phase === "working") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("working");
    setError(null);
    try {
      const imageDataUrl = await readAsDataUrl(file);
      if (controller.signal.aborted) return;
      const result = await scanReceipt({
        data: {
          imageDataUrl,
          mimeType: file.type as (typeof RECEIPT_MIME_TYPES)[number],
          locale: (state.settings.language ?? "en") as "en" | "bg" | "de" | "fr" | "es",
          currency: accountCurrency as "USD",
          categories: categoryIds,
        },
      });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setError(t(`scan.err.${result.code}`));
        setPhase("ready");
        return;
      }
      setDraft(result.draft);
      setPhase("review");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(t(err instanceof Error && err.message === "read" ? "scan.err.readFile" : "scan.err.provider"));
      setPhase("ready");
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(file ? "ready" : "idle");
  };

  const confirm = () => {
    if (!draft || savingRef.current) return;
    if (!accountId) {
      toast.error(t("err.selectAccount"));
      return;
    }
    if (!(draft.total > 0)) {
      toast.error(t("err.enterAmount"));
      return;
    }
    savingRef.current = true;
    const category = categoryIds.includes(draft.category) ? draft.category : categoryIds[0];
    const cat = expenseCats.find((c) => c.id === category);
    const title = draft.merchant.trim() || (cat ? catName(cat.id, cat.name, cat.builtin) : category);
    addTransaction({
      title,
      category,
      amount: -draft.total,
      date: new Date(`${draft.date}T12:00:00`).toISOString(),
      accountId,
      currency: accountCurrency,
      ...(draft.tax !== null ? { note: `${t("scan.vat")} ${formatIn(draft.tax, accountCurrency)}` } : {}),
    });
    toast.success(t("scan.savedTitle"), {
      description: `${formatIn(-draft.total, accountCurrency)} · ${title}`,
    });
    clearImage();
    navigate({ to: "/wallet" });
  };

  const setDraftField = <K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <AppShell>
      <PageHeader
        subtitle={t("scan.subtitle")}
        title={t("scan.title")}
        right={
          <button
            onClick={() => navigate({ to: "/wallet" })}
            className="tap grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            aria-label={t("action.close")}
          >
            <X className="h-4 w-4" />
          </button>
        }
      />

      <section className="px-5">
        <div className="flex gap-3 rounded-3xl border border-border bg-card/60 p-4 backdrop-blur">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t("scan.privacyTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("scan.privacyBody")}</p>
          </div>
        </div>
      </section>

      <input
        ref={cameraRef}
        type="file"
        accept={RECEIPT_MIME_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        aria-label={t("scan.takePhoto")}
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept={RECEIPT_MIME_TYPES.join(",")}
        className="sr-only"
        aria-label={t("scan.chooseFile")}
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      <section className="mt-4 px-5">
        {previewUrl ? (
          <div className="overflow-hidden rounded-3xl border border-border bg-card/60">
            <img src={previewUrl} alt={t("scan.previewAlt")} className="max-h-64 w-full object-contain" />
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <p className="min-w-0 truncate text-xs text-muted-foreground">{file?.name}</p>
              <button
                onClick={clearImage}
                className="tap inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("scan.remove")}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/40 p-6 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border">
              <Camera className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold">{t("scan.choose")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("scan.chooseDesc")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fmt(t("scan.limit"), { size: Math.round(RECEIPT_MAX_BYTES / (1024 * 1024)) })}
            </p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="tap flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium"
          >
            <Camera className="h-4 w-4" aria-hidden="true" /> {t("scan.takePhoto")}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="tap flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" /> {t("scan.chooseFile")}
          </button>
        </div>
      </section>

      <div aria-live="polite" className="px-5">
        {error ? (
          <p className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {phase === "working" ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t("scan.extracting")}
          </p>
        ) : null}
      </div>

      {phase !== "review" ? (
        <section className="mt-4 px-5">
          {phase === "working" ? (
            <button
              onClick={cancel}
              className="tap flex w-full items-center justify-center gap-2 rounded-full border border-border py-4 text-sm font-semibold"
            >
              <X className="h-4 w-4" aria-hidden="true" /> {t("scan.cancel")}
            </button>
          ) : (
            <button
              onClick={extract}
              disabled={!file}
              className="tap flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-opacity disabled:opacity-40"
              style={{ background: "var(--gradient-primary)" }}
            >
              {error ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : null}
              {error ? t("scan.retry") : t("scan.extract")}
            </button>
          )}
        </section>
      ) : null}

      {phase === "review" && draft ? (
        <section className="mt-5 px-5">
          <h2 className="text-sm font-semibold">{t("scan.review")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("scan.reviewDesc")}</p>

          <div className="mt-3 space-y-2">
            <label className="block rounded-2xl border border-border bg-card/60 px-4 py-3">
              <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">{t("scan.merchant")}</span>
              <input
                value={draft.merchant}
                onChange={(e) => setDraftField("merchant", e.target.value)}
                className="mt-1 w-full bg-transparent text-sm outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block rounded-2xl border border-border bg-card/60 px-4 py-3">
                <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">{t("scan.total")}</span>
                <input
                  inputMode="decimal"
                  value={String(draft.total)}
                  onChange={(e) => setDraftField("total", Math.abs(Number.parseFloat(e.target.value)) || 0)}
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                />
              </label>
              <label className="block rounded-2xl border border-border bg-card/60 px-4 py-3">
                <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">{t("scan.vat")}</span>
                <input
                  inputMode="decimal"
                  value={draft.tax === null ? "" : String(draft.tax)}
                  onChange={(e) => {
                    const parsed = Number.parseFloat(e.target.value);
                    setDraftField("tax", Number.isFinite(parsed) ? Math.abs(parsed) : null);
                  }}
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                />
              </label>
            </div>
            <label className="block rounded-2xl border border-border bg-card/60 px-4 py-3">
              <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">{t("scan.date")}</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraftField("date", e.target.value || draft.date)}
                className="mt-1 w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          {draft.currency !== accountCurrency ? (
            <p className="mt-2 rounded-2xl border border-border bg-card/40 px-4 py-2 text-[11px] text-muted-foreground">
              {t("scan.currencyNote")} {draft.currency} → {accountCurrency}
            </p>
          ) : null}

          <p className="mt-4 mb-2 text-xs uppercase tracking-widest text-muted-foreground">{t("label.account")}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {state.accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccountId(a.id)}
                aria-pressed={accountId === a.id}
                className={cn(
                  "shrink-0 rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors",
                  accountId === a.id ? "border-primary/60 bg-primary/10" : "border-border bg-card/60",
                )}
              >
                {a.name} · {a.currency}
              </button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-xs uppercase tracking-widest text-muted-foreground">{t("label.category")}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {expenseCats.map((c) => {
              const Icon = iconRegistry[c.icon] ?? iconRegistry.Tag;
              const active = draft.category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setDraftField("category", c.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition-colors",
                    active ? "border-primary/60 bg-primary/10" : "border-border bg-card/60",
                  )}
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in oklab, ${c.color} 22%, transparent)` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: c.color }} aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-medium">{catName(c.id, c.name, c.builtin)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => { setDraft(null); setPhase("ready"); }}
              className="tap flex items-center justify-center gap-2 rounded-full border border-border py-4 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("scan.rescan")}
            </button>
            <button
              onClick={confirm}
              className="tap flex items-center justify-center gap-2 rounded-full py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> {t("scan.confirm")}
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
