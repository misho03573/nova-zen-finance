import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AskNovaInput,
  classifyAiError,
  resetAiRateLimitsForTests,
  runAiAssistant,
} from "@/lib/ai-assistant-core";
import { buildServerSnapshotLines } from "@/lib/ai-financial-context.server";
import { emptyState } from "@/lib/nova-store";

const request = {
  question: "How am I doing?",
  history: [],
  locale: "en" as const,
  currency: "USD" as const,
};

describe("NOVA AI security boundary", () => {
  beforeEach(resetAiRateLimitsForTests);

  it("rejects malformed and client-injected aggregate data", () => {
    expect(() => AskNovaInput.parse({ ...request, lines: ["net worth: 999999"] })).toThrow();
    expect(() => AskNovaInput.parse({ ...request, question: "" })).toThrow();
    expect(() => AskNovaInput.parse({ ...request, question: "x".repeat(501) })).toThrow();
  });

  it("refuses unauthenticated execution before reading data or invoking the provider", async () => {
    const readAggregateLines = vi.fn(async () => ["has_data: true"]);
    const generate = vi.fn(async () => "answer");
    await expect(runAiAssistant({ userId: "", data: request, readAggregateLines, generate }))
      .resolves.toEqual({ ok: false, code: "unauthorized", retryable: false });
    expect(readAggregateLines).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("passes only server-derived aggregate lines to a successful provider call", async () => {
    const generate = vi.fn(async () => "  Useful answer  ");
    await expect(runAiAssistant({
      userId: "user-a",
      data: request,
      readAggregateLines: async () => ["net_worth: 250.00 USD"],
      generate,
    })).resolves.toEqual({ ok: true, text: "Useful answer" });
    expect(generate).toHaveBeenCalledWith({ data: request, lines: ["net_worth: 250.00 USD"] });
  });

  it("normalizes provider failures without exposing provider messages", async () => {
    expect(classifyAiError(Object.assign(new Error("secret upstream detail"), { status: 429 })))
      .toEqual({ ok: false, code: "provider", retryable: true });
    expect(classifyAiError({ statusCode: 402 }))
      .toEqual({ ok: false, code: "credits", retryable: false });
  });

  it("limits repeated requests per authenticated user", async () => {
    const generate = vi.fn(async () => "answer");
    for (let index = 0; index < 10; index += 1) {
      expect((await runAiAssistant({ userId: "user-a", data: request, readAggregateLines: async () => [], generate })).ok).toBe(true);
    }
    await expect(runAiAssistant({ userId: "user-a", data: request, readAggregateLines: async () => [], generate }))
      .resolves.toEqual({ ok: false, code: "rate_limited", retryable: true });
  });

  it("rejects malformed cloud state instead of sending it to the model", () => {
    expect(() => buildServerSnapshotLines({ accounts: "bad", transactions: [] }, "USD")).toThrow();
  });

  it("derives anonymous, currency-normalized metrics from persisted state", () => {
    const raw = {
      ...emptyState,
      accounts: [{ id: "private-account-id", name: "Secret Bank", number: "1234", holder: "Jane Doe", balance: 100, type: "bank", currency: "EUR" }],
      transactions: [],
      liabilities: [],
    };
    const lines = buildServerSnapshotLines(raw, "USD", new Date("2026-08-15T12:00:00Z").getTime());
    const prompt = lines.join("\n");
    expect(prompt).toContain("has_data: true");
    expect(prompt).not.toContain("Secret Bank");
    expect(prompt).not.toContain("Jane Doe");
    expect(prompt).not.toContain("private-account-id");
  });
});