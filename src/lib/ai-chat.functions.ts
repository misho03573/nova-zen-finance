/**
 * NOVA AI assistant — real model call through the Lovable AI Gateway.
 *
 * Privacy contract: the client sends only `snapshotLines(buildAiSnapshot(ctx))`
 * — aggregated, anonymized metrics with no names, ids or transaction titles.
 * The model never sees raw app state.
 */
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";

const AskInput = z.object({
  question: z.string().min(1).max(500),
  lines: z.array(z.string().max(300)).max(40),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(8),
  locale: z.enum(["en", "bg", "de", "fr", "es"]),
});

type AskData = z.infer<typeof AskInput>;

const LANGUAGE_NAMES: Record<AskData["locale"], string> = {
  en: "English",
  bg: "Bulgarian",
  de: "German",
  fr: "French",
  es: "Spanish",
};

function systemPrompt(locale: AskData["locale"], lines: string[]): string {
  return [
    "You are NOVA AI, the assistant inside the NOVA personal finance app.",
    "Below are anonymized financial metrics for the user's current month. They are ground truth: never contradict them, and never invent numbers not derivable from them. If the metrics cannot answer a question, say so briefly.",
    "You know nothing about the user's identity — never ask for or repeat personal details.",
    `Reply in ${LANGUAGE_NAMES[locale]}. Keep answers under 120 words: warm, concrete, practical. Plain text only — short sentences, at most 3 bullet lines using \"•\". No markdown headings, no tables.`,
    "",
    "Metrics:",
    ...lines,
  ].join("\n");
}

export const askNova = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AskInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) {
      return { ok: false as const, error: "AI service is not configured." };
    }

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key, // satisfies the SDK; the gateway authenticates on the header below
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: systemPrompt(data.locale, data.lines),
        messages: [
          ...data.history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: data.question },
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

      const text = (await result.text)?.trim();
      if (!text) {
        return { ok: false as const, error: "The assistant returned no answer. Please try again." };
      }
      return { ok: true as const, text };
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message.slice(0, 300)
          : "The AI service could not be reached. Please try again shortly.";
      return { ok: false as const, error: message };
    }
  });
