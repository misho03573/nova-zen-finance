import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, Merge, Pencil, Store } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { EmptyState } from "@/components/nova/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNova, analyticsTxs } from "@/lib/nova-store";
import { summarizeMerchants, type MerchantSummary } from "@/lib/merchant";
import { useT, fmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/merchants")({
  head: () => ({
    meta: [
      { title: "Merchants · NOVA" },
      {
        name: "description",
        content:
          "Clean up messy bank descriptors: rename merchants, merge duplicate identities and keep your spending grouped correctly.",
      },
      { property: "og:title", content: "Merchants · NOVA" },
      {
        property: "og:description",
        content: "Rename and merge merchant identities so your spending groups correctly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MerchantsPage,
});

function MerchantsPage() {
  const t = useT();
  const { state, renameMerchant, mergeMerchants } = useNova();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MerchantSummary | null>(null);
  const [name, setName] = useState("");
  const [mergeMode, setMergeMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Native amounts are only summed for an activity ranking here — no cross
  // currency arithmetic is displayed, so no conversion is needed.
  const merchants = useMemo(
    () =>
      summarizeMerchants(
        analyticsTxs(state.transactions).map((tx) => ({
          title: tx.title,
          amount: tx.amount,
          date: tx.date,
        })),
        state.merchants ?? [],
      ),
    [state.transactions, state.merchants],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merchants;
    return merchants.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.variants.some((v) => v.toLowerCase().includes(q)),
    );
  }, [merchants, query]);

  const openRename = (m: MerchantSummary) => {
    setEditing(m);
    setName(m.label);
  };

  const saveRename = () => {
    if (!editing) return;
    renameMerchant(editing.key, name.trim());
    toast.success(fmt(t("mrc.renamed"), { name: name.trim() || editing.label }));
    setEditing(null);
  };

  const togglePick = (key: string) => {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  const applyMerge = () => {
    if (picked.length < 2) return;
    const [targetKey, ...sources] = picked;
    const target = merchants.find((m) => m.key === targetKey);
    mergeMerchants(targetKey, target?.label ?? targetKey, sources);
    toast.success(fmt(t("mrc.merged"), { n: picked.length, name: target?.label ?? targetKey }));
    setPicked([]);
    setMergeMode(false);
  };

  return (
    <AppShell>
      <PageHeader
        title={t("mrc.title")}
        subtitle={t("mrc.subtitle")}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setMergeMode((v) => !v);
                setPicked([]);
              }}
              className={cn(
                "press rounded-full border px-3 py-1.5 text-xs font-medium",
                mergeMode
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground",
              )}
            >
              {mergeMode ? t("action.cancel") : t("mrc.merge")}
            </button>
            <Link
              to="/settings"
              aria-label={t("action.back")}
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      {merchants.length === 0 ? (
        <section className="px-5 pt-4">
          <EmptyState
            icon={<Store className="h-6 w-6" />}
            title={t("mrc.empty")}
            description={t("mrc.emptyDesc")}
            ctaLabel={t("mrc.addTx")}
            ctaTo="/add"
          />
        </section>
      ) : (
        <>
          <section className="px-5 pt-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("mrc.search")}
              aria-label={t("mrc.search")}
            />
            {mergeMode ? (
              <p className="mt-2 text-[11px] text-muted-foreground">{t("mrc.mergeHint")}</p>
            ) : null}
          </section>

          <section className="space-y-2 px-5 pt-3">
            {shown.map((m) => {
              const idx = picked.indexOf(m.key);
              return (
                <div
                  key={m.key}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-card/70 p-3 backdrop-blur",
                    idx >= 0 ? "border-primary" : "border-border",
                  )}
                >
                  <button
                    onClick={() => (mergeMode ? togglePick(m.key) : openRename(m))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold">{m.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {fmt(t("mrc.meta"), { n: m.count, v: m.variants.length })}
                    </p>
                  </button>
                  {mergeMode ? (
                    <span className="text-[11px] font-semibold text-primary">
                      {idx === 0 ? t("mrc.target") : idx > 0 ? `#${idx + 1}` : ""}
                    </span>
                  ) : (
                    <button
                      onClick={() => openRename(m)}
                      aria-label={t("mrc.rename")}
                      className="press grid h-8 w-8 place-items-center rounded-xl bg-secondary"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          {mergeMode ? (
            <section className="px-5 pt-4">
              <Button onClick={applyMerge} disabled={picked.length < 2} className="w-full">
                <Merge className="mr-2 h-4 w-4" />
                {fmt(t("mrc.mergeCta"), { n: picked.length })}
              </Button>
            </section>
          ) : null}
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mrc.rename")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="mrc-name">{t("mrc.displayName")}</Label>
              <Input
                id="mrc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t("mrc.renameHint")}</p>
            </div>
            {editing ? (
              <div className="rounded-xl border border-border bg-secondary/50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("mrc.variants")}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {editing.variants.slice(0, 6).map((v) => (
                    <li key={v} className="truncate text-[11px] text-muted-foreground">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("action.cancel")}
            </Button>
            <Button onClick={saveRename}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="h-6" />
    </AppShell>
  );
}
