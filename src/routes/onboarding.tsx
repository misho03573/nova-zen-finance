import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import {
  Wallet,
  Target,
  Sparkles,
  PieChart,
  Bell,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to NOVA" },
      {
        name: "description",
        content: "A calm, beautiful way to see and shape your money — meet NOVA.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const ONBOARDED_KEY = "nova.onboarded.v1";

type Slide = {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
};

const slides: Slide[] = [
  {
    icon: <Wallet className="h-7 w-7" />,
    eyebrow: "Welcome to NOVA",
    title: "Every dollar,\nbeautifully clear.",
    body: "Track spending across cash, banks, cards, and crypto — all in one calm view.",
    accent: "var(--gradient-primary)",
  },
  {
    icon: <Target className="h-7 w-7" />,
    eyebrow: "Goals",
    title: "Save with\nintention.",
    body: "Set goals, automate contributions, and watch the ETA move closer every week.",
    accent: "var(--gradient-accent)",
  },
  {
    icon: <Sparkles className="h-7 w-7" />,
    eyebrow: "NOVA AI",
    title: "Insights that\nfeel personal.",
    body: "Ask questions. Get forecasts, spending changes, and smart nudges in plain English.",
    accent: "linear-gradient(135deg, oklch(0.7 0.19 300), oklch(0.62 0.18 200))",
  },
  {
    icon: <PieChart className="h-7 w-7" />,
    eyebrow: "Budgets",
    title: "Stay on track,\neffortlessly.",
    body: "Category budgets with real-time progress and gentle warnings before you overspend.",
    accent: "linear-gradient(135deg, oklch(0.78 0.17 80), oklch(0.68 0.19 30))",
  },
  {
    icon: <Bell className="h-7 w-7" />,
    eyebrow: "Stay ahead",
    title: "Never miss\na bill.",
    body: "Get notified before subscriptions renew or a budget slips. Fully optional, always private.",
    accent: "linear-gradient(135deg, oklch(0.7 0.18 155), oklch(0.6 0.16 200))",
  },
];

function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const s = slides[i];
  const last = i === slides.length - 1;

  const finish = () => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {}
    navigate({ to: user ? "/" : "/auth" });
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[520px] -z-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col px-6 pb-8 pt-6">
        <header className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            NOVA
          </span>
          <button
            onClick={finish}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </header>

        <div className="mt-10 grid place-items-center">
          <div
            key={i}
            className="animate-float-slow grid h-32 w-32 place-items-center rounded-4xl border border-white/10 text-white shadow-[var(--shadow-elevated)]"
            style={{ background: s.accent }}
          >
            <div className="animate-scale-in">{s.icon}</div>
          </div>
        </div>

        <div key={`copy-${i}`} className="mt-10 animate-fade-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            {s.eyebrow}
          </p>
          <h1 className="mt-3 whitespace-pre-line text-4xl font-semibold leading-[1.05] tracking-tight text-foreground">
            {s.title}
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
            {s.body}
          </p>
        </div>

        <div className="mt-auto pt-10">
          <div className="mb-6 flex items-center justify-center gap-1.5">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted",
                )}
              />
            ))}
          </div>
          <button
            onClick={() => (last ? finish() : setI((v) => v + 1))}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-[0.98]"
            style={{ background: "var(--gradient-primary)" }}
          >
            {last ? "Get started" : "Continue"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          {!last ? (
            <button
              onClick={finish}
              className="mt-3 w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              I'll explore on my own
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { ONBOARDED_KEY };