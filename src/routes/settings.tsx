import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Fingerprint,
  Bell,
  Palette,
  Coins,
  Download,
  ShieldCheck,
  Trash2,
  Sun,
  Moon,
  Laptop,
  Lock,
  Cloud,
  Upload,
  Languages,
  Sparkles,
  LogOut,
  UserCircle,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { Tag } from "lucide-react";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";
import { useNova } from "@/lib/nova-store";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PreviewBadge } from "@/components/nova/PreviewBadge";
import { useConfirm } from "@/components/nova/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · NOVA" },
      { name: "description", content: "Personalize NOVA — theme, security, currency and more." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { state, setSettings, exportData, importData } = useNova();
  const t = useT();
  const s = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const confirm = useConfirm();
  const { user, fullName, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const openNameEditor = () => {
    setNameDraft(fullName);
    setNameOpen(true);
  };
  const saveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      toast.error("Enter your full name");
      return;
    }
    setSavingName(true);
    const res = await updateProfile({ fullName: name });
    setSavingName(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Name updated");
    setNameOpen(false);
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Sign out?",
      description: "You'll need to sign in again to access your synced data.",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    await signOut();
    navigate({ to: "/auth" });
  };

  const handleExport = () => {
    try {
      const blob = new Blob([exportData()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nova-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch {
      toast.error("Could not export");
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: "Reset all NOVA data?",
      description: "This deletes every account, transaction, goal, budget and setting. This can't be undone.",
      confirmLabel: "Reset everything",
      destructive: true,
    });
    if (!ok) return;
    try {
      localStorage.removeItem("nova.store.v3");
      localStorage.removeItem("nova.store.v2");
      localStorage.removeItem("nova.store.v1");
      location.reload();
    } catch {}
  };

  const handleRestore = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    const ok = importData(text);
    if (ok) toast.success("Backup restored");
    else toast.error("Invalid backup file");
  };

  const ACCENTS: { key: string; label: string; grad: string }[] = [
    { key: "default", label: "Aurora", grad: "var(--gradient-primary)" },
    { key: "sunset", label: "Sunset", grad: "linear-gradient(135deg, oklch(0.72 0.19 30), oklch(0.6 0.22 350))" },
    { key: "ocean", label: "Ocean", grad: "linear-gradient(135deg, oklch(0.68 0.15 220), oklch(0.5 0.16 260))" },
    { key: "matcha", label: "Matcha", grad: "linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.5 0.14 175))" },
  ];

  const LANGS = [
    { code: "en", label: "English" },
    { code: "bg", label: "Български" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
  ];

  return (
    <AppShell>
      <PageHeader
        subtitle={t("settings.subtitle")}
        title={t("settings.title")}
        right={
          <Link
            to="/"
            className="rounded-full border border-border bg-card/60 px-3 py-2 text-xs font-medium backdrop-blur"
          >
            {t("settings.done")}
          </Link>
        }
      />

      <section className="px-5">
        <Group title={t("set.account")}>
          {user ? (
            <Row
              icon={<UserCircle className="h-4 w-4" />}
              label={fullName || t("set.addName")}
              description={t("set.nameDesc")}
            >
              <button
                onClick={openNameEditor}
                className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
              >
                {t("set.editBtn")}
              </button>
            </Row>
          ) : null}
          <Row
            icon={<UserCircle className="h-4 w-4" />}
            label={user?.email ?? t("set.guest")}
            description={user ? t("set.signedIn") : t("set.notSignedIn")}
          >
            {user ? (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
              >
                <LogOut className="h-3 w-3" />
                {t("set.signOut")}
              </button>
            ) : (
              <Link
                to="/auth"
                className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
              >
                {t("set.signIn")}
              </Link>
            )}
          </Row>
        </Group>

        <Group title={t("settings.group.appearance")}>
          <Row icon={<Palette className="h-4 w-4" />} label={t("settings.theme")}>
            <div className="inline-flex rounded-full border border-border bg-background/60 p-1 text-xs">
              {(
                [
                  { k: "light", Icon: Sun },
                  { k: "dark", Icon: Moon },
                  { k: "system", Icon: Laptop },
                ] as const
              ).map(({ k, Icon }) => (
                <button
                  key={k}
                  onClick={() => setTheme(k)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 capitalize transition-colors",
                    theme === k ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                  style={theme === k ? { background: "var(--gradient-primary)" } : undefined}
                >
                  <Icon className="h-3 w-3" />
                  {k}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<Coins className="h-4 w-4" />} label={t("settings.currency")}>
            <CurrencyPicker variant="chip" />
          </Row>
          <Row icon={<Sparkles className="h-4 w-4" />} label={t("settings.accent")}>
            <div className="flex gap-1.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => { setSettings({ accent: a.key }); toast.success(`Accent · ${a.label}`); }}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform",
                    (s.accent ?? "default") === a.key ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ background: a.grad }}
                  aria-label={a.label}
                />
              ))}
            </div>
          </Row>
          <Row icon={<Languages className="h-4 w-4" />} label={t("settings.language")}>
            <select
              value={s.language ?? "en"}
              onChange={(e) => setSettings({ language: e.target.value })}
              className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </Row>
        </Group>

        <Group title={t("settings.group.security")}>
          <Row icon={<Fingerprint className="h-4 w-4" />} label={t("set.faceId")} description={t("set.faceIdDesc")} preview>
            <Switch
              checked={!!s.faceId}
              onCheckedChange={(v) => { setSettings({ faceId: v }); toast.message(v ? "Face ID on" : "Face ID off"); }}
            />
          </Row>
          <Row icon={<Fingerprint className="h-4 w-4" />} label={t("set.touchId")} description={t("set.touchIdDesc")} preview>
            <Switch
              checked={!!s.touchId}
              onCheckedChange={(v) => setSettings({ touchId: v })}
            />
          </Row>
          <Row icon={<Lock className="h-4 w-4" />} label={t("set.pin")} description={s.pinEnabled ? t("set.pinActive") : t("set.pinSet")} preview>
            <button
              onClick={() => setPinOpen(true)}
              className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
            >
              {s.pinEnabled ? t("set.change") : t("set.setBtn")}
            </button>
          </Row>
          <Row icon={<Lock className="h-4 w-4" />} label={t("set.autoLock")} description={t("set.autoLockDesc")} preview>
            <select
              value={s.autoLockMinutes ?? 5}
              onChange={(e) => setSettings({ autoLockMinutes: parseInt(e.target.value, 10) })}
              className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
            >
              <option value={1}>{t("set.autolock.min1")}</option>
              <option value={5}>{t("set.autolock.min5")}</option>
              <option value={15}>{t("set.autolock.min15")}</option>
              <option value={60}>{t("set.autolock.hr1")}</option>
              <option value={0}>{t("set.autolock.never")}</option>
            </select>
          </Row>
          <Row icon={<ShieldCheck className="h-4 w-4" />} label={t("set.hideBalances")} description={t("set.hideBalancesDesc")}>
            <Switch
              checked={!!s.hideBalances}
              onCheckedChange={(v) => setSettings({ hideBalances: v })}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.sync")}>
          <Row icon={<Cloud className="h-4 w-4" />} label={t("set.cloudSync")} description={t("set.cloudSyncDesc")} preview>
            <Switch
              checked={!!s.cloudSync}
              onCheckedChange={(v) => { setSettings({ cloudSync: v }); toast.message(v ? "Cloud sync coming soon" : "Cloud sync off"); }}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.notifications")}>
          <Row icon={<Bell className="h-4 w-4" />} label={t("set.push")} description={t("set.pushDesc")} preview>
            <Switch
              checked={s.notifications}
              onCheckedChange={(v) => setSettings({ notifications: v })}
            />
          </Row>
          <Row icon={<Bell className="h-4 w-4" />} label={t("set.budgetAlerts")} description={t("set.budgetAlertsDesc")}>
            <Switch
              checked={s.budgetAlerts}
              onCheckedChange={(v) => setSettings({ budgetAlerts: v })}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.data")}>
          <Link
            to="/categories"
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left text-sm shadow-[var(--shadow-card)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <Tag className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{t("settings.categories.link")}</span>
              <span className="block text-xs text-muted-foreground">{t("settings.categories.linkDesc")}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <button
            onClick={handleExport}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left text-sm shadow-[var(--shadow-card)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <Download className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{t("set.export")}</span>
              <span className="block text-xs text-muted-foreground">{t("set.exportDesc")}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left text-sm shadow-[var(--shadow-card)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <Upload className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{t("set.restore")}</span>
              <span className="block text-xs text-muted-foreground">{t("set.restoreDesc")}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleRestore(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={handleReset}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-destructive/20">
              <Trash2 className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{t("set.reset")}</span>
              <span className="block text-xs opacity-80">{t("set.resetDesc")}</span>
            </span>
          </button>
        </Group>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          {t("set.version")}{" "}
          <Link to="/diagnostics" className="underline decoration-dotted underline-offset-4 hover:text-foreground">
            {t("set.diagnostics")}
          </Link>
        </p>
      </section>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{s.pinEnabled ? t("set.pinChangeTitle") : t("set.pinSetTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>{t("set.pinLabel")}</Label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="text-center text-2xl tracking-[0.6em]"
            />
            <Button
              onClick={() => {
                if (pin.length !== 6) { toast.error("Enter 6 digits"); return; }
                setSettings({ pin, pinEnabled: true });
                setPin("");
                setPinOpen(false);
                toast.success("PIN set");
              }}
              className="w-full"
            >
              {t("set.pinSave")}
            </Button>
            {s.pinEnabled && (
              <button
                onClick={() => { setSettings({ pinEnabled: false, pin: undefined }); setPinOpen(false); toast.message("PIN disabled"); }}
                className="w-full text-xs text-muted-foreground"
              >
                {t("set.pinDisable")}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("set.nameTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="fullNameField">{t("auth.fullName")}</Label>
            <Input
              id="fullNameField"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t("auth.placeholder.name")}
              autoFocus
            />
            <Button onClick={saveName} disabled={savingName} className="w-full">
              {savingName ? t("set.nameSaving") : t("set.nameSave")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  description,
  children,
  preview,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children?: React.ReactNode;
  preview?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 shadow-[var(--shadow-card)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold">{label}</p>
          {preview ? <PreviewBadge /> : null}
        </div>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}