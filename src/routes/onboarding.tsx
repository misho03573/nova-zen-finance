import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
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
  key: string;
};

const ICON = "h-8 w-8";
const STROKE = 1.5;

const slides: Slide[] = [
  { icon: <Wallet className={ICON} strokeWidth={STROKE} />, key: "s1" },
  { icon: <Target className={ICON} strokeWidth={STROKE} />, key: "s2" },
  { icon: <LineChart className={ICON} strokeWidth={STROKE} />, key: "s3" },
  { icon: <PieChart className={ICON} strokeWidth={STROKE} />, key: "s4" },
  { icon: <Receipt className={ICON} strokeWidth={STROKE} />, key: "s5" },
  { icon: <ShieldCheck className={ICON} strokeWidth={STROKE} />, key: "s6" },
];

function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();
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
    <div className="relative min-h-dvh-screen safe-x bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[520px] -z-0"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="safe-top relative mx-auto flex min-h-dvh-screen w-full max-w-[430px] flex-col px-6 pb-[calc(2rem+var(--safe-bottom))] pt-6">
        <header className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            NOVA
          </span>
          <button
            onClick={finish}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("onb.skip")}
          </button>
        </header>

        <div className="mt-10 grid place-items-center">
          <div
            key={i}
            className="grid h-24 w-24 place-items-center rounded-3xl border border-border bg-card text-primary shadow-[var(--shadow-card)]"
          >
            <div className="animate-scale-in">{s.icon}</div>
          </div>
        </div>


        <div key={`copy-${i}`} className="mt-10 animate-fade-in">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            {t(`onb.${s.key}.eyebrow`)}
          </p>
          <h1 className="mt-3 whitespace-pre-line text-4xl font-semibold leading-[1.05] tracking-tight text-foreground">
            {t(`onb.${s.key}.title`)}
          </h1>
          <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
            {t(`onb.${s.key}.body`)}
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
            {last ? t("onb.start") : t("onb.continue")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          {!last ? (
            <button
              onClick={finish}
              className="mt-3 w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("onb.explore")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { ONBOARDED_KEY };