import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NovaMark } from "@/components/nova/NovaMark";
import { useAuth } from "@/lib/auth";
import { lovable } from "@/integrations/lovable/index";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · NOVA" },
      { name: "description", content: "Sign in or create your NOVA account to sync your finances." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, signInEmail, signUpEmail } = useAuth();
  const tr = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error(tr("auth.err.credentials"));
      return;
    }
    if (mode === "signup" && fullName.trim().length < 2) {
      toast.error(tr("auth.err.name"));
      return;
    }
    setBusy(true);
    const res = mode === "signin"
      ? await signInEmail(email, password)
      : await signUpEmail(email, password, fullName.trim());
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (mode === "signup") {
      toast.success(tr("auth.ok.signup"));
    } else {
      toast.success(tr("auth.ok.signin"));
    }
  }

  async function onGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? "Google sign-in failed");
    }
    // On success the browser redirects or the session is set; auth effect will route.
  }

  return (
    <div className="min-h-dvh-screen safe-x bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] -z-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="safe-top relative mx-auto flex min-h-dvh-screen w-full max-w-[430px] flex-col px-5 pb-[calc(2.5rem+var(--safe-bottom))] pt-16">
        <div className="mb-10 flex flex-col items-start gap-3">
          <div
            className="grid h-14 w-14 place-items-center rounded-[1.35rem] text-primary-foreground shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            <NovaMark className="h-7 w-7" />
          </div>
          <div>
            <span className="font-display text-xl font-semibold tracking-[0.32em]">NOVA</span>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Plan · Track · Grow
            </p>
          </div>
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to sync your accounts across devices."
            : "Sign up and your current data moves with you."}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">{tr("auth.fullName")}</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={tr("auth.placeholder.name")}
                required
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">{tr("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr("auth.placeholder.email")}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{tr("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogle}
          disabled={busy}
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          {tr("auth.google")}
        </Button>

        <button
          type="button"
          className="mt-8 text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? (
            <>{tr("auth.noAccount")} <span className="text-foreground font-medium">{tr("auth.signup")}</span></>
          ) : (
            <>{tr("auth.hasAccount")} <span className="text-foreground font-medium">{tr("auth.signin")}</span></>
          )}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 12s4.1 9.7 9.2 9.7c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}