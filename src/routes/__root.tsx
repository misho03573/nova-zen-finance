import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { NovaProvider } from "@/lib/nova-store";
import { CurrencyProvider } from "@/lib/currency";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { useNova } from "@/lib/nova-store";
import { ACCENTS } from "@/lib/i18n";
import { ConfirmProvider } from "@/components/nova/ConfirmDialog";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LockProvider, useLock } from "@/lib/lock";
import { LockScreen } from "@/components/nova/LockScreen";
import { SyncIndicator } from "@/components/nova/SyncIndicator";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        {/* i18n-ignore */}
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {/* i18n-ignore */}
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {/* i18n-ignore */}
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {/* i18n-ignore */}
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {/* i18n-ignore */}
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {/* i18n-ignore */}
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {/* i18n-ignore */}
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover",
      },
      { title: "NOVA — Personal Finance, Reimagined" },
      { name: "description", content: "NOVA is a beautifully crafted personal finance app. Track spending, hit savings goals, and understand your money at a glance." },
      { name: "theme-color", content: "#0b0f14" },
      { name: "application-name", content: "NOVA" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "NOVA" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:title", content: "NOVA — Personal Finance, Reimagined" },
      { property: "og:description", content: "Track spending, hit savings goals, and understand your money at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/icon-180.png" },
    ],

  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CurrencyProvider>
          <AuthProvider>
            <LockProvider>
              <NovaProvider>
                <ConfirmProvider>
                  {hydrated ? (
                    <LockGate>
                      <OnboardingGate />
                      <AuthGate />
                      <PreferencesApplier />
                      <RecurringAdvancer />
                      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
                      <Outlet />
                      <SyncIndicator />
                      <Toaster position="top-center" />
                    </LockGate>
                  ) : (
                    <div className="min-h-screen bg-background" aria-hidden />
                  )}
                </ConfirmProvider>
              </NovaProvider>
            </LockProvider>
          </AuthProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Blocks every financial screen behind the lock screen while locked. */
function LockGate({ children }: { children: ReactNode }) {
  const { locked } = useLock();
  if (locked) return <LockScreen />;
  return <>{children}</>;
}

function OnboardingGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname === "/onboarding" || pathname === "/auth") return;
    try {
      const done = window.localStorage.getItem("nova.onboarded.v1");
      if (!done) navigate({ to: "/onboarding" });
    } catch {}
  }, [pathname, navigate]);
  return null;
}

function AuthGate() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (pathname === "/auth" || pathname === "/onboarding") return;
    try {
      const onboarded = window.localStorage.getItem("nova.onboarded.v1");
      if (!onboarded) return; // let OnboardingGate handle it
    } catch {}
    if (!user) navigate({ to: "/auth" });
  }, [user, loading, pathname, navigate]);
  return null;
}

function PreferencesApplier() {
  const { state } = useNova();
  const accent = state.settings.accent ?? "default";
  const language = state.settings.language ?? "en";

  useEffect(() => {
    const root = document.documentElement;
    const preset = ACCENTS[accent];
    if (preset) {
      root.style.setProperty("--primary", preset.primary);
      root.style.setProperty("--ring", preset.primary);
      root.style.setProperty("--primary-glow", preset.primary);
      root.style.setProperty("--gradient-primary", preset.gradient);
      root.style.setProperty("--shadow-glow", preset.glow);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--primary-glow");
      root.style.removeProperty("--gradient-primary");
      root.style.removeProperty("--shadow-glow");
    }
  }, [accent]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

function RecurringAdvancer() {
  const { advanceRecurring } = useNova();
  useEffect(() => {
    advanceRecurring();
    // Only run once per session; store persistence handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
