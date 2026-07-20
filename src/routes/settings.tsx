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
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
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

  const handleReset = () => {
    if (!confirm("Reset all NOVA data? This can't be undone.")) return;
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
          <Row icon={<Fingerprint className="h-4 w-4" />} label="Face ID" description="Unlock with your face">
            <Switch
              checked={!!s.faceId}
              onCheckedChange={(v) => { setSettings({ faceId: v }); toast.message(v ? "Face ID on" : "Face ID off"); }}
            />
          </Row>
          <Row icon={<Fingerprint className="h-4 w-4" />} label="Touch ID" description="Fingerprint unlock">
            <Switch
              checked={!!s.touchId}
              onCheckedChange={(v) => setSettings({ touchId: v })}
            />
          </Row>
          <Row icon={<Lock className="h-4 w-4" />} label="PIN code" description={s.pinEnabled ? "6-digit PIN active" : "Set a 6-digit PIN"}>
            <button
              onClick={() => setPinOpen(true)}
              className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs"
            >
              {s.pinEnabled ? "Change" : "Set"}
            </button>
          </Row>
          <Row icon={<Lock className="h-4 w-4" />} label="Auto-lock" description="Lock when inactive">
            <select
              value={s.autoLockMinutes ?? 5}
              onChange={(e) => setSettings({ autoLockMinutes: parseInt(e.target.value, 10) })}
              className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
            >
              <option value={1}>1 min</option>
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={60}>1 hour</option>
              <option value={0}>Never</option>
            </select>
          </Row>
          <Row icon={<ShieldCheck className="h-4 w-4" />} label="Hide balances" description="Blur amounts on the home screen">
            <Switch
              checked={!!s.hideBalances}
              onCheckedChange={(v) => setSettings({ hideBalances: v })}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.sync")}>
          <Row icon={<Cloud className="h-4 w-4" />} label="Cloud sync" description="Sync across devices (preview)">
            <Switch
              checked={!!s.cloudSync}
              onCheckedChange={(v) => { setSettings({ cloudSync: v }); toast.message(v ? "Cloud sync coming soon" : "Cloud sync off"); }}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.notifications")}>
          <Row icon={<Bell className="h-4 w-4" />} label="Push" description="Transactions & summaries">
            <Switch
              checked={s.notifications}
              onCheckedChange={(v) => setSettings({ notifications: v })}
            />
          </Row>
          <Row icon={<Bell className="h-4 w-4" />} label="Budget alerts" description="Warn near limits">
            <Switch
              checked={s.budgetAlerts}
              onCheckedChange={(v) => setSettings({ budgetAlerts: v })}
            />
          </Row>
        </Group>

        <Group title={t("settings.group.data")}>
          <button
            onClick={handleExport}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left text-sm shadow-[var(--shadow-card)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <Download className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Export / backup</span>
              <span className="block text-xs text-muted-foreground">Download JSON backup</span>
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
              <span className="block text-sm font-semibold">Restore backup</span>
              <span className="block text-xs text-muted-foreground">Import a NOVA JSON file</span>
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
              <span className="block text-sm font-semibold">Reset all data</span>
              <span className="block text-xs opacity-80">Delete accounts, transactions, goals</span>
            </span>
          </button>
        </Group>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">NOVA · v0.5 Pro</p>
      </section>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{s.pinEnabled ? "Change PIN" : "Set PIN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>6-digit PIN</Label>
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
              Save PIN
            </Button>
            {s.pinEnabled && (
              <button
                onClick={() => { setSettings({ pinEnabled: false, pin: undefined }); setPinOpen(false); toast.message("PIN disabled"); }}
                className="w-full text-xs text-muted-foreground"
              >
                Disable PIN
              </button>
            )}
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
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 shadow-[var(--shadow-card)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}