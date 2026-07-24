import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, Tag } from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { EmptyState } from "@/components/nova/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNova } from "@/lib/nova-store";
import {
  iconNames, iconRegistry, colorPalette, type UserCategory, type CategoryType,
} from "@/lib/categories";
import { useT, useCategoryName } from "@/lib/i18n";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Categories · NOVA" },
      { name: "description", content: "Create custom categories for how you actually spend." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const t = useT();
  const catName = useCategoryName();
  const { state, addCategory, updateCategory, deleteCategory } = useNova();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserCategory | null>(null);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (c: UserCategory) => { setEditing(c); setOpen(true); };

  const onDelete = async (c: UserCategory) => {
    if (c.builtin) { toast.error(t("cat.cannotDeleteBuiltin")); return; }
    const ok = await confirm({
      title: t("cat.delete.title"),
      description: t("cat.delete.desc"),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    const res = deleteCategory(c.id);
    if (!res.ok) {
      toast.error(res.reason === "in-use" ? t("cat.cannotDeleteInUse") : t("cat.cannotDeleteBuiltin"));
      return;
    }
    toast.success(t("cat.deleted"));
  };

  const sections: { type: CategoryType; title: string }[] = [
    { type: "expense",  title: t("cat.section.expense") },
    { type: "income",   title: t("cat.section.income") },
    { type: "transfer", title: t("cat.section.transfer") },
  ];

  return (
    <AppShell>
      <PageHeader
        subtitle={t("cat.subtitle")}
        title={t("cat.title")}
        right={
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
              aria-label={t("action.back")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <button
              onClick={openNew}
              className="grid h-10 w-10 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
              aria-label={t("cat.new")}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        }
      />

      <section className="px-5 space-y-6">
        {state.categories.length === 0 ? (
          <EmptyState
            icon={<Tag className="h-6 w-6" />}
            title={t("cat.empty.title")}
            description={t("cat.empty.desc")}
          />
        ) : null}
        {sections.map(({ type, title }) => {
          const items = state.categories.filter((c) => c.type === type);
          if (items.length === 0) return null;
          return (
            <div key={type}>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {title}
              </p>
              <div className="space-y-2">
                {items.map((c) => {
                  const Icon = iconRegistry[c.icon] ?? Tag;
                  const label = catName(c.id, c.name, c.builtin);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 shadow-[var(--shadow-card)]"
                    >
                      <span
                        className="grid h-10 w-10 place-items-center rounded-xl"
                        style={{ backgroundColor: `color-mix(in oklab, ${c.color} 22%, transparent)` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: c.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{label}</p>
                        {c.builtin ? (
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {t("cat.builtin")}
                          </p>
                        ) : null}
                      </div>
                      <button
                        onClick={() => openEdit(c)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background/60 text-muted-foreground hover:text-foreground"
                        aria-label={t("action.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!c.builtin ? (
                        <button
                          onClick={() => onDelete(c)}
                          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background/60 text-muted-foreground hover:text-destructive"
                          aria-label={t("action.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <CategoryDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={(payload) => {
          if (editing) {
            updateCategory({ ...editing, ...payload });
            toast.success(t("cat.updated"));
          } else {
            addCategory(payload);
            toast.success(t("cat.created"));
          }
          setOpen(false);
        }}
      />
    </AppShell>
  );
}

function CategoryDialog({
  open, onOpenChange, editing, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: UserCategory | null;
  onSave: (c: Omit<UserCategory, "id"> & { builtin?: boolean }) => void;
}) {
  const t = useT();
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<CategoryType>(editing?.type ?? "expense");
  const [icon, setIcon] = useState(editing?.icon ?? iconNames[0]);
  const [color, setColor] = useState(editing?.color ?? colorPalette[0]);

  // Reset when opening/switching
  const key = editing?.id ?? "new";
  const [k, setK] = useState(key);
  if (open && k !== key) {
    setK(key);
    setName(editing?.name ?? "");
    setType(editing?.type ?? "expense");
    setIcon(editing?.icon ?? iconNames[0]);
    setColor(editing?.color ?? colorPalette[0]);
  }

  const canSave = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? t("cat.edit") : t("cat.new")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">{t("label.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("cat.name.placeholder")}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs">{t("label.type")}</Label>
            <div className="mt-1.5 inline-flex w-full rounded-full border border-border bg-background/60 p-1 text-xs">
              {(["expense", "income", "transfer"] as const).map((k2) => (
                <button
                  key={k2}
                  onClick={() => setType(k2)}
                  disabled={!!editing?.builtin}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 capitalize transition-colors",
                    type === k2 ? "text-primary-foreground" : "text-muted-foreground",
                    editing?.builtin && "opacity-60",
                  )}
                  style={type === k2 ? { background: "var(--gradient-primary)" } : undefined}
                >
                  {t(`cat.type.${k2}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("label.icon")}</Label>
            <div className="mt-1.5 grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto">
              {iconNames.map((n) => {
                const Icon = iconRegistry[n];
                const active = icon === n;
                return (
                  <button
                    key={n}
                    onClick={() => setIcon(n)}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl border",
                      active ? "border-primary/60 bg-primary/15" : "border-border bg-card/60",
                    )}
                  >
                    <Icon className="h-4 w-4" style={{ color: active ? color : undefined }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("label.color")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {colorPalette.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform",
                    color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), type, icon, color, builtin: editing?.builtin })}
            className="w-full rounded-full py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {editing ? t("action.save") : t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}