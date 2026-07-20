import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, X, Calendar as CalendarIcon, StickyNote, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { AppShell, PageHeader } from "@/components/nova/AppShell";
import { categories } from "@/lib/nova-data";
import { useNova } from "@/lib/nova-store";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "Add transaction · NOVA" },
      { name: "description", content: "Quickly log an expense or income in NOVA." },
    ],
  }),
  component: AddPage,
});

function AddPage() {
  const navigate = useNavigate();
  const { state, addTransaction } = useNova();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("0");
  const [category, setCategory] = useState("food");
  const [accountId, setAccountId] = useState(state.accounts[0]?.id ?? "");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState("");

  const numericAmount = useMemo(() => Number.parseFloat(amount) || 0, [amount]);
  const canSave = numericAmount > 0 && accountId;

  const filteredCategories = useMemo(
    () =>
      type === "income"
        ? categories.filter((c) => ["salary", "gift"].includes(c.id))
        : categories.filter((c) => !["salary"].includes(c.id)),
    [type],
  );

  const handleSave = () => {
    if (!canSave) return;
    const signed = type === "expense" ? -numericAmount : numericAmount;
    const cat = categories.find((c) => c.id === category) ?? categories[0];
    addTransaction({
      title: note.trim() || cat.name,
      category,
      amount: signed,
      date: date.toISOString(),
      accountId,
      note: note.trim() || undefined,
    });
    toast.success(`${type === "expense" ? "Expense" : "Income"} added`, {
      description: `${type === "expense" ? "−" : "+"}$${numericAmount.toFixed(2)} · ${cat.name}`,
    });
    navigate({ to: "/wallet" });
  };

  const press = (k: string) => {
    setAmount((prev) => {
      if (k === "⌫") return prev.length <= 1 ? "0" : prev.slice(0, -1);
      if (k === ".") return prev.includes(".") ? prev : prev + ".";
      if (prev === "0") return k;
      return prev + k;
    });
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

  return (
    <AppShell>
      <PageHeader
        subtitle="New"
        title="Add transaction"
        right={
          <button
            onClick={() => navigate({ to: "/" })}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 backdrop-blur"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        }
      />

      <section className="px-5">
        <div className="mx-auto inline-flex w-full rounded-full border border-border bg-card/60 p-1 backdrop-blur">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setType(k);
                setCategory(k === "income" ? "salary" : "food");
              }}
              className={cn(
                "flex-1 rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors",
                type === k ? "text-primary-foreground" : "text-muted-foreground",
              )}
              style={type === k ? { background: "var(--gradient-primary)" } : undefined}
            >
              {k}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 px-5 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Amount</p>
        <p
          key={amount}
          className="mt-1 animate-scale-in text-5xl font-semibold tracking-tight"
        >
          <span className="text-muted-foreground">$</span>
          {amount}
        </p>
      </section>

      <section className="mt-6 px-5">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Account</p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {state.accounts.map((a) => {
            const active = accountId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAccountId(a.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card/60 hover:bg-card",
                )}
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 text-white"
                  style={{ background: a.gradient }}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{a.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {a.number}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 px-5">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Category</p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filteredCategories.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-3 py-2.5 transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card/60 hover:bg-card",
                )}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl"
                  style={{ backgroundColor: `color-mix(in oklab, ${c.color} 22%, transparent)` }}
                >
                  <Icon className="h-4 w-4" style={{ color: c.color }} />
                </span>
                <span className="text-[11px] font-medium">{c.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 space-y-2 px-5">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-left text-sm">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">
                {isToday(date) ? "Today" : format(date, "EEEE")}
              </span>
              <span className="text-muted-foreground">{format(date, "MMM d, yyyy")}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </section>

      <section className="mt-6 px-5">
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="rounded-2xl border border-border bg-card/60 py-4 text-lg font-semibold backdrop-blur transition-colors hover:bg-card"
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-opacity disabled:opacity-40"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Check className="h-4 w-4" /> Save transaction
        </button>
      </section>
    </AppShell>
  );
}

function isToday(d: Date) {
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}