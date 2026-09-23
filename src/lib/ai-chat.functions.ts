/**
 * NOVA AI assistant — real model call through the Lovable AI Gateway.
 *
 * Privacy contract: the browser sends only a question, bounded history, locale,
 * and display currency. The authenticated server derives anonymized aggregates
 * from that user's own cloud state. Raw records never enter the model prompt.
 */
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AskNovaInput, runAiAssistant, type AskNovaData, type AskNovaResult } from "@/lib/ai-assistant-core";
import { buildServerSnapshotLines } from "@/lib/ai-financial-context.server";

const LANGUAGE_NAMES: Record<AskNovaData["locale"], string> = {
  en: "English",
  bg: "Bulgarian",
  de: "German",
  fr: "French",
  es: "Spanish",
};

export function systemPrompt(locale: AskNovaData["locale"], lines: string[]): string {
  return [
    "You are NOVA AI, the assistant inside the NOVA personal finance app.",
    "Below are anonymized financial metrics for the user's current month. They are ground truth: never contradict them, and never invent numbers not derivable from them. If the metrics cannot answer a question, say so briefly.",
    "You know nothing about the user's identity — never ask for or repeat personal details.",
    "You are strictly read-only. Never claim to execute transactions, transfers, budget changes, account changes, or any other financial action.",
    "Offer educational, non-binding guidance only. Never claim to be a financial adviser or guarantee outcomes. Encourage professional advice for consequential decisions.",
    `Reply in ${LANGUAGE_NAMES[locale]}. Keep answers under 180 words: warm, concrete, practical. Use concise Markdown with short paragraphs or bullet lists; avoid tables.`,
    "",
    "Metrics:",
    ...lines,
  ].join("\n");
}

export const askNova = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => AskNovaInput.parse(data))
  .handler(async ({ data, context }): Promise<AskNovaResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) {
      return { ok: false, code: "configuration", retryable: false };
    }

    return runAiAssistant({
      userId: context.userId,
      data,
      readAggregateLines: async () => {
        const { data: row, error } = await context.supabase
          .from("user_data")
          .select("data")
          .eq("user_id", context.userId)
          .maybeSingle();
        if (error) throw Object.assign(new Error("Cloud read failed"), { status: 503 });
        return buildServerSnapshotLines(row?.data ?? null, data.currency);
      },
      generate: async ({ data: request, lines }) => {
        const runIdFetch = createLovableAiGatewayRunIdFetch();
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: systemPrompt(request.locale, lines),
        messages: [
          ...request.history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: request.question },
        ],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
        });
        return result.text;
      },
    }).then((result) => {
      if (!result.ok) console.error("[NOVA AI] Request failed", result.code);
      return result;
    });
  });
