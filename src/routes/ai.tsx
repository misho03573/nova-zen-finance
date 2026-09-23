import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, LineChart, ArrowLeft, Bot } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useT, useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useFinancialContext } from "@/lib/use-financial-context";
import { suggestActions, buildAiSnapshot, snapshotLines } from "@/lib/ai-context";
import { askNova } from "@/lib/ai-chat.functions";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "NOVA AI · Personal Finance Assistant" },
      { name: "description", content: "Ask NOVA AI anything about your money." },
    ],
  }),
  component: AIChat,
});

type Msg = { id: string; role: "user" | "assistant"; content: string };

const LANGS = ["en", "bg", "de", "fr", "es"] as const;
type Lang = (typeof LANGS)[number];

function AIChat() {
  const { format: _format } = useCurrencySafe();
  void _format;
  const tr = useT();
  const locale = useLocale();
  const { fullName } = useAuth();
  const firstName = fullName?.split(" ")[0] || "there";
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content: fmt(tr("ai.welcome"), { name: firstName }),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const ctx = useFinancialContext();
  // Structured actions instead of free-text links: the UI navigates for real.
  const actions = useMemo(() => suggestActions(ctx), [ctx]);

  const askNovaFn = useServerFn(askNova);
  const lang: Lang = (LANGS as readonly string[]).includes(locale) ? (locale as Lang) : "en";

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    const userMsg: Msg = { id: `u_${Date.now()}`, role: "user", content: q };
    // Only anonymized aggregates leave the device — never raw state.
    const payload = {
      question: q,
      lines: snapshotLines(buildAiSnapshot(ctx)),
      history: messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content })),
      locale: lang,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    try {
      const res = await askNovaFn({ data: payload });
      const reply = res.ok ? res.text : tr("ai.error");
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", content: tr("ai.error") }]);
    } finally {
      setTyping(false);
    }
  };

  const suggestions = [
    tr("ai.sug.afford"),
    tr("ai.sug.fuel"),
    tr("ai.sug.waste"),
    tr("ai.sug.save"),
  ];

  return (
    <AppShell>
      <PageHeader
        subtitle={tr("ai.subtitle")}
        title={tr("ai.title")}
        right={
          <Link
            to="/"
            className="tap grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
      />

      <section className="flex-1 space-y-3 px-5 pb-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role}>{m.content}</MessageBubble>
        ))}
        {typing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <span className="flex gap-1">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </span>
          </div>
        )}
        {messages.length > 1 && !typing && actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pl-10">
            {actions.map((a) => (
              <Link
                key={a.id}
                to={a.route as never}
                className="press flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
              >
                {tr(a.labelKey)}
              </Link>
            ))}
          </div>
        ) : null}
        <div ref={endRef} />
      </section>

      {messages.length <= 1 && (
        <section className="px-5 pb-3">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-card"
              >
                <LineChart className="h-3 w-3 text-primary" />
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="sticky bottom-24 mt-2 px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-full border border-border bg-card/80 p-1.5 pl-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr("ai.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="tap grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            aria-label={tr("ai.send")}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>
    </AppShell>
  );
}

function MessageBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md px-4 py-2.5 text-sm text-primary-foreground shadow-[var(--shadow-card)]"
          style={{ background: "var(--gradient-primary)" }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Bot className="h-4 w-4" />
      </span>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-bl-md border border-border bg-card/70 px-4 py-2.5 text-sm shadow-[var(--shadow-card)]">
        {children}
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}

// Rule-based mock intelligence
function makeAnswer(
  state: ReturnType<typeof useNova>["state"],
  format: (n: number) => string,
  code: string,
  tr: (k: string) => string,
) {
  return (q: string) => {
    const query = q.toLowerCase();
    const nb = netWorthBreakdown(state);
    const balance = totalBalance(state.accounts);
    const { income, expenses } = monthlyTotals(state.transactions);
    const rate = savingsRate(income, expenses);
    const byCat = monthlySpendByCategory(state.transactions);
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    const amountMatch = query.match(/(\d+[\d,.]*)/);
    if (query.includes("afford")) {
      const cost = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 400;
      const safe = balance * 0.15;
      const pct = Math.round((cost / (balance || 1)) * 100);
      if (cost <= safe) {
        return fmt(tr("ai.reply.afford.yes"), { cost: format(cost), balance: format(balance), pct });
      }
      const weeks = Math.max(1, Math.ceil(cost / (income - expenses || 500)));
      return fmt(tr("ai.reply.afford.tight"), { cost: format(cost), pct, weeks });
    }

    if (query.includes("waste") || query.includes("wasting")) {
      const wasteCats = ["coffee", "subscription", "entertainment", "shopping"];
      const waste = top.filter(([c]) => wasteCats.includes(c)).slice(0, 3);
      const total = waste.reduce((s, [, v]) => s + v, 0);
      const list = waste.map(([c, v]) => `• ${c} — ${format(v)}`).join("\n");
      return fmt(tr("ai.reply.waste"), { total: format(total), list, saved: format(total * 0.3) });
    }

    if (query.match(/\b(fuel|gas|transport|uber)\b/)) {
      const y = new Date().getFullYear();
      const total = state.transactions
        .filter((t) => new Date(t.date).getFullYear() === y && (t.category === "transport" || /fuel|gas|uber/i.test(t.title)))
        .reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0);
      return fmt(tr("ai.reply.fuel"), { total: format(total), year: y, monthly: format(total / 12) });
    }

    if (query.includes("save") && amountMatch) {
      const amt = parseFloat(amountMatch[1].replace(/,/g, ""));
      return fmt(tr("ai.reply.save"), {
        amt: format(amt),
        y1: format(amt * 12),
        y3: format(amt * 36),
        y5: format(amt * 60),
        y5r: format(amt * 68),
      });
    }

    if (query.includes("net worth")) {
      return fmt(tr("ai.reply.networth"), {
        net: format(nb.net),
        assets: format(nb.assets),
        liab: format(nb.liab),
        pct: Math.round((nb.invest / (nb.assets || 1)) * 100),
      });
    }

    if (query.includes("savings rate") || query.includes("saving rate")) {
      return fmt(tr("ai.reply.savingsRate"), {
        pct: Math.round(rate * 100),
        income: format(income),
        expenses: format(expenses),
      });
    }

    if (query.includes("top") || query.includes("biggest") || query.includes("category")) {
      const list = top.slice(0, 3).map(([c, v], i) => `${i + 1}. ${c} — ${format(v)}`).join("\n");
      return fmt(tr("ai.reply.top"), { list });
    }

    return fmt(tr("ai.reply.snapshot"), {
      code,
      net: format(nb.net),
      liquid: format(balance),
      income: format(income),
      expenses: format(expenses),
      rate: Math.round(rate * 100),
    });
  };
}