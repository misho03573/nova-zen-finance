import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, Plus, Pencil, Trash2, Wand2, Tag } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { EmptyState } from "@/components/nova/EmptyState";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useNova } from "@/lib/nova-store";
import { useCategories, iconRegistry } from "@/lib/categories";
import { useT, useCategoryName, fmt } from "@/lib/i18n";
import {
  operatorsFor, RULE_FIELDS, type CategoryRule, type RuleField, type RuleOperator,
} from "@/lib/category-rules";
import { cn } from "@/lib/utils";

type RuleSearch = { merchant?: string; category?: string };

export const Route = createFileRoute("/rules")({
  validateSearch: (search: Record<string, unknown>): RuleSearch => ({
    merchant: typeof search.merchant === "string" ? search.merchant : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Smart Rules · NOVA" },
      { name: "description", content: "Automatic rules that categorize your transactions the moment they land." },
      { property: "og:title", content: "Smart Rules · NOVA" },
      { property: "og:description", content: "Automatic rules that categorize your transactions the moment they land." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  const t = useT();
  const catName = useCategoryName();
  const confirm = useConfirm();
  const search = useSearch({ from: "/rules" });
  const { state, addCategoryRule, updateCategoryRule, deleteCategoryRule, toggleCategoryRule } = useNova();
  const cats = useCategories();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRule | null>(null);
  const [prefill, setPrefill] = useState<Partial<CategoryRule> | null>(null);

  useEffect(() => {
    if (!search.merchant) return;
    setEditing(null);
    setPrefill({
      name: fmt(t("rules.fromTx.name"), { merchant: search.merchant }),
      field: "merchant",
      operator: "contains",
      value: search.merchant,
      categoryId: search.category,
    });
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.merchant, search.category]);

  const sorted = useMemo(
    () => [...state.categoryRules].sort((a, b) => a.priority - b.priority),
    [state.categoryRules],
  );
  const active = sorted.filter((r) => r.enabled).length;

  const fieldLabel = (f: RuleField) => t(`rules.field.${f}`);
  const opLabel = (o: RuleOperator) => t(`rules.op.${o}`);

  const onDelete = async (r: CategoryRule) => {
    const ok = await confirm({
      title: t("rules.delete.title"),
      description: t("rules.delete.desc"),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteCategoryRule(r.id);
    toast.success(t("rules.deleted"));
  };

  return (
    <AppShell>
      <PageHeader
        subtitle={t("rules.subtitle")}
        title={t("rules.title")}
        right={
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              aria-label={t("action.back")}
              className="press grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <button
              onClick={() => { setEditing(null); setPrefill(null); setOpen(true); }}
              aria-label={t("rules.new")}
              className="press grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        }
      />

      <section className="px-5">
        <div
          className="relative overflow-hidden rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-card)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("rules.active")}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {active}
                <span className="text-muted-foreground">/{sorted.length}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("rules.manualNote")}</p>
            </div>
            <span
              className="grid h-12 w-12 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Wand2 className="h-5 w-5" />
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 space-y-2 px-5">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Wand2 className="h-6 w-6" />}
            title={t("rules.empty.title")}
            description={t("rules.empty.desc")}
          />
        ) : (
          sorted.map((r) => {
            const cat = cats.find((c) => c.id === r.categoryId);
            const Icon = iconRegistry[cat?.icon ?? "Tag"] ?? Tag;
            const color = cat?.color ?? "oklch(0.72 0.05 260)";
            return (
              <div
                key={r.id}
                className="animate-rise-in flex items-center gap-3 rounded-3xl border border-border bg-card/70 p-4 shadow-[var(--shadow-card)]"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                  style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fieldLabel(r.field)} · {opLabel(r.operator)} · {r.value} →{" "}
                    {cat ? catName(cat.id, cat.name, cat.builtin) : r.categoryId}
                  </p>
                </div>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={() => toggleCategoryRule(r.id)}
                  aria-label={fmt(t("rules.toggleAria"), { name: r.name })}
                />
                <button
                  onClick={() => { setPrefill(null); setEditing(r); setOpen(true); }}
                  aria-label={t("action.edit")}
                  className="tap grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(r)}
                  aria-label={t("action.delete")}
                  className="tap grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </section>

      <RuleDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        prefill={prefill}
        nextPriority={sorted.length + 1}
        onSave={(payload) => {
          if (editing) {
            updateCategoryRule({ ...editing, ...payload });
            toast.success(t("rules.updated"));
          } else {
            addCategoryRule(payload);
            toast.success(t("rules.created"));
          }
          setOpen(false);
        }}
      />
    </AppShell>
  );
}

function RuleDialog({
  open, onOpenChange, editing, prefill, nextPriority, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CategoryRule | null;
  prefill: Partial<CategoryRule> | null;
  nextPriority: number;
  onSave: (r: Omit<CategoryRule, "id">) => void;
}) {
  const t = useT();
  const catName = useCategoryName();
  const cats = useCategories();
  const [name, setName] = useState("");
  const [field, setField] = useState<RuleField>("merchant");
  const [operator, setOperator] = useState<RuleOperator>("contains");
  const [value, setValue] = useState("");
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? "food");
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState(nextPriority);

  useEffect(() => {
    if (!open) return;
    const src = editing ?? prefill ?? null;
    setName(src?.name ?? "");
    setField((src?.field as RuleField) ?? "merchant");
    setOperator((src?.operator as RuleOperator) ?? "contains");
    setValue(src?.value ?? "");
    setCategoryId(src?.categoryId ?? cats[0]?.id ?? "food");
    setEnabled(src?.enabled ?? true);
    setPriority(src?.priority ?? nextPriority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefill]);

  const ops = operatorsFor(field);
  useEffect(() => {
    if (!ops.includes(operator)) setOperator(ops[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field]);

  const submit = () => {
    if (!name.trim() || !value.trim()) {
      toast.error(t("rules.invalid"));
      return;
    }
    onSave({
      name: name.trim(),
      field,
      operator,
      value: value.trim(),
      categoryId,
      enabled,
      priority: Number.isFinite(priority) ? priority : nextPriority,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("rules.edit") : t("rules.new")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">{t("rules.name")}</Label>
            <Input
              id="rule-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("rules.name.placeholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("rules.field")}</Label>
            <div className="flex flex-wrap gap-2">
              {RULE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setField(f)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    field === f ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  {t(`rules.field.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("rules.operator")}</Label>
            <div className="flex flex-wrap gap-2">
              {ops.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOperator(o)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    operator === o ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  {t(`rules.op.${o}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-value">{t("rules.value")}</Label>
            {field === "type" ? (
              <div className="flex gap-2">
                {(["expense", "income"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setValue(k)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium",
                      value === k ? "border-primary bg-primary/10 text-primary" : "border-border",
                    )}
                  >
                    {t(`rules.type.${k}`)}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                id="rule-value"
                value={value}
                maxLength={80}
                inputMode={field === "amount" ? "decimal" : "text"}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field === "amount" ? t("rules.amount.placeholder") : t("rules.value.placeholder")}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("rules.category")}</Label>
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => {
                const Icon = iconRegistry[c.icon] ?? Tag;
                const activeCat = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                      activeCat ? "border-primary bg-primary/10 text-primary" : "border-border",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                    {catName(c.id, c.name, c.builtin)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="rule-priority">{t("rules.priority")}</Label>
              <Input
                id="rule-priority"
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPriority(Number.parseInt(e.target.value, 10))}
              />
              <p className="text-[11px] text-muted-foreground">{t("rules.priorityHint")}</p>
            </div>
            <div className="flex items-center gap-2 pb-8">
              <Label htmlFor="rule-enabled">{t("rules.enabled")}</Label>
              <Switch id="rule-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button onClick={submit}>{t("action.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}