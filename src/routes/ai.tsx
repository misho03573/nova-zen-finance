import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, ArrowLeft, Bot } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { useNova, totalBalance, monthlyTotals, savingsRate, monthlySpendByCategory, netWorthBreakdown } from "@/lib/nova-store";
import { useCurrency } from "@/lib/currency";

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

function AIChat() {
  const { state } = useNova();
  const { format, currency } = useCurrency();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi Alex — I'm NOVA AI. Ask me anything about your money. Try "Can I afford a new monitor?" or "Where am I wasting money?"`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const answer = useMemo(() => makeAnswer(state, format, currency.code), [state, format, currency.code]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const um: Msg = { id: `u_${Date.now()}`, role: "user", content: text.trim() };
    setMessages((m) => [...m, um]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const reply = answer(text);
      setMessages((m) => [...m, { id: `a_${Date.now()}`, role: "assistant", content: reply }]);
      setTyping(false);
    }, 650 + Math.random() * 500);
  };

  const suggestions = [
    "Can I afford a new monitor?",
    "How much did I spend on fuel this year?",
    "Where am I wasting money?",
    "What if I save 300 every month?",
  ];

  return (
    <AppShell>
      <PageHeader
        subtitle="Beta"
        title="NOVA AI"
        right={
          <Link
            to="/"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
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
                <Sparkles className="h-3 w-3 text-primary" />
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
            placeholder="Ask NOVA AI…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            aria-label="Send"
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
) {
  return (q: string) => {
    const query = q.toLowerCase();
    const nb = netWorthBreakdown(state);
    const balance = totalBalance(state.accounts);
    const { income, expenses } = monthlyTotals(state.transactions);
    const rate = savingsRate(income, expenses);
    const byCat = monthlySpendByCategory(state.transactions);
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    // "afford X for $Y"
    const amountMatch = query.match(/(\d+[\d,.]*)/);
    if (query.includes("afford")) {
      const cost = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 400;
      const safe = balance * 0.15;
      if (cost <= safe) {
        return `Yes — a ${format(cost)} purchase is comfortable. Your liquid balance is ${format(balance)} and this uses only ${Math.round(
          (cost / balance) * 100,
        )}% of it. Your emergency fund stays untouched.`;
      }
      return `Technically yes, but it's tight. ${format(cost)} is about ${Math.round(
        (cost / balance) * 100,
      )}% of your liquid balance. I'd wait ${Math.max(1, Math.ceil(cost / (income - expenses || 500)))} weeks or use a savings goal.`;
    }

    if (query.includes("waste") || query.includes("wasting")) {
      const wasteCats = ["coffee", "subscription", "entertainment", "shopping"];
      const waste = top.filter(([c]) => wasteCats.includes(c)).slice(0, 3);
      const total = waste.reduce((s, [, v]) => s + v, 0);
      return `You've spent ${format(total)} this month on lifestyle categories. Biggest leaks:\n${waste
        .map(([c, v]) => `• ${c} — ${format(v)}`)
        .join("\n")}\n\nTrimming these by 30% would free ${format(total * 0.3)} for goals.`;
    }

    if (query.match(/\b(fuel|gas|transport|uber)\b/)) {
      const y = new Date().getFullYear();
      const total = state.transactions
        .filter((t) => new Date(t.date).getFullYear() === y && (t.category === "transport" || /fuel|gas|uber/i.test(t.title)))
        .reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0);
      return `You've spent ${format(total)} on transport / fuel so far in ${y}. That's about ${format(total / 12)} per month.`;
    }

    if (query.includes("save") && amountMatch) {
      const amt = parseFloat(amountMatch[1].replace(/,/g, ""));
      return `Saving ${format(amt)} monthly compounds fast:\n• 1 year: ${format(amt * 12)}\n• 3 years: ${format(amt * 36)}\n• 5 years: ${format(
        amt * 60,
      )}\nAt a 5% return, in 5 years you'd have about ${format(amt * 68)}.`;
    }

    if (query.includes("net worth")) {
      return `Your net worth is ${format(nb.net)} — assets ${format(nb.assets)} minus liabilities ${format(nb.liab)}. Investments make up ${Math.round(
        (nb.invest / (nb.assets || 1)) * 100,
      )}% of your assets.`;
    }

    if (query.includes("savings rate") || query.includes("saving rate")) {
      return `This month your savings rate is ${Math.round(rate * 100)}%. Income ${format(income)}, expenses ${format(expenses)}. Anything above 20% is excellent.`;
    }

    if (query.includes("top") || query.includes("biggest") || query.includes("category")) {
      return `Your top categories this month:\n${top
        .slice(0, 3)
        .map(([c, v], i) => `${i + 1}. ${c} — ${format(v)}`)
        .join("\n")}`;
    }

    // Default: financial summary
    return `Snapshot in ${code}:\n• Net worth: ${format(nb.net)}\n• Liquid: ${format(balance)}\n• This month income: ${format(income)}\n• This month spend: ${format(
      expenses,
    )}\n• Savings rate: ${Math.round(rate * 100)}%\n\nAsk about a category, a goal, or a purchase you're considering.`;
  };
}