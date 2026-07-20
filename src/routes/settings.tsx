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
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { CurrencyPicker } from "@/components/nova/CurrencyPicker";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";
import { useNova } from "@/lib/nova-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const { state, setSettings, exportData } = useNova();
  const s = state.settings;

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
      localStorage.removeItem("nova.store.v2");
      localStorage.removeItem("nova.store.v1");
      location.reload();
    } catch {}
  };

  return (
    <AppShell>
      <PageHeader
        subtitle="Preferences"
        title="Settings"
        right={
          <Link
            to="/"
            className="rounded-full border border-border bg-card/60 px-3 py-2 text-xs font-medium backdrop-blur"
          >
            Done
          </Link>
        }
      />

      <section className="px-5">
        <Group title="Appearance">
          <Row icon={<Palette className="h-4 w-4" />} label="Theme">
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
          <Row icon={<Coins className="h-4 w-4" />} label="Currency">
            <CurrencyPicker variant="chip" />
          </Row>
        </Group>

        <Group title="Security">
          <Row icon={<Fingerprint className="h-4 w-4" />} label="Biometric lock" description="Face ID / Touch ID">
            <Switch
              checked={s.biometric}
              onCheckedChange={(v) => {
                setSettings({ biometric: v });
                toast.message(v ? "Biometric lock on" : "Biometric lock off");
              }}
            />
          </Row>
          <Row icon={<ShieldCheck className="h-4 w-4" />} label="Privacy" description="Hide balances in previews">
            <Switch checked={false} disabled />
          </Row>
        </Group>

        <Group title="Notifications">
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

        <Group title="Data">
          <button
            onClick={handleExport}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left text-sm shadow-[var(--shadow-card)]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <Download className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Export data</span>
              <span className="block text-xs text-muted-foreground">Download JSON backup</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
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

        <p className="mt-6 text-center text-[11px] text-muted-foreground">NOVA · v1.0.0</p>
      </section>
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