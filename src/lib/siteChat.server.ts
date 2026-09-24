/**
 * Server-only: builds the assistant's grounding context from published products.
 *
 * Reads the public catalog with the publishable key (RLS), exactly like the shop
 * pages do, so the assistant can only describe products visitors can already see.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./ai-gateway.server";
import { createPublicServerClient } from "./publicData.server";
import { offerPrice } from "./offers";
import type { SiteChatMessage } from "./siteChat";
import {
  createSiteChatHandler,
  siteChatAllowedOrigins,
} from "./siteChatGuard.server";
import { siteConfig } from "@/config/site";

const SITE_CHAT_MODEL = "openai/gpt-6-astra";
/** Answers are two or three sentences; this caps the cost of any one reply. */
const SITE_CHAT_MAX_OUTPUT_TOKENS = 600;
const SITE_CHAT_TIMEOUT_MS = 60_000;

const CATALOG_COLUMNS =
  "slug,title,summary,kind,checkout_mode,price_display_mode,amount_minor,currency,shop_category";

interface CatalogRow {
  slug: string;
  title: string;
  summary: string | null;
  kind: "free" | "paid";
  checkout_mode: "native" | "external";
  price_display_mode: "fixed" | "provider";
  amount_minor: number;
  currency: string;
  shop_category: string | null;
}

export async function loadProductContext(): Promise<string> {
  try {
    const { data, error } = await createPublicServerClient()
      .from("offers")
      .select(CATALOG_COLUMNS)
      .eq("status", "published")
      .eq("show_in_shop", true)
      .eq("funnel_only", false)
      .order("shop_featured", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(40)
      .abortSignal(AbortSignal.timeout(6000));
    if (error || !data?.length) return "";
    return (data as unknown as CatalogRow[])
      .map((row) =>
        [
          `- ${row.title} (${offerPrice(row)})`,
          row.shop_category ? `  Category: ${row.shop_category}` : "",
          row.summary ? `  What it is: ${row.summary.slice(0, 400)}` : "",
          `  Page: /offers/${row.slug}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");
  } catch {
    return "";
  }
}

export function buildSystemPrompt(productContext: string): string {
  const { identity } = siteConfig;
  const email = identity.contactEmail;
  return [
    `You are the assistant on ${identity.name}'s website (${identity.siteUrl}).`,
    `${identity.name} is a ${identity.role}. Topics: ${identity.knowsAbout.join(", ")}.`,
    "",
    "Your job: answer short, practical questions about the products and services listed below, and about what the site offers. Be warm, direct and brief (two or three short sentences, or a tight list). Write in plain language for busy business owners.",
    "",
    "Hard rules:",
    "- Use only the product facts listed below. Never invent products, prices, dates, bonuses, refund terms, delivery times, guarantees or results.",
    "- Do not give legal, tax, medical or financial advice, and never discuss discounts or custom deals.",
    "- Do not ask for or store payment details, passwords or personal data.",
    `- If the answer is not in the product facts below, or the visitor wants a decision only ${identity.name} can make (custom work, partnerships, speaking, billing, anything about their specific situation), say so plainly in one sentence and invite them to email ${email || "the contact address on the site"}. Do not guess.`,
    "- Link to pages with plain relative paths like /shop or /offers/slug. Never link to an external site that is not listed here.",
    "- Write A.I. with periods, never AI. Avoid em dashes.",
    "",
    productContext
      ? `Published products:\n${productContext}\n\nThe full catalog lives at /shop. Speaking and event inquiries go to /speaking.`
      : "No product catalog is available right now, so do not describe specific products. Point visitors to /shop and invite them to email with questions.",
  ].join("\n");
}

/** Durable limiter: the shared service-role-only `newsletter_rate_limit_hit` RPC. */
async function rateLimitSiteChat(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .rpc("newsletter_rate_limit_hit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    })
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error(`rate limit RPC failed: ${error.message}`);
  return data === true;
}

async function streamSiteChatReply(
  messages: SiteChatMessage[],
  request: Request,
): Promise<Response> {
  const key = process.env["LOVABLE_API_KEY"] as string;
  const system = buildSystemPrompt(await loadProductContext());
  const initialRunId = getLovableAiGatewayRunId(request);
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: lovable.responses(SITE_CHAT_MODEL),
    system,
    // Visitors can never supply or override the instructions.
    allowSystemInMessages: false,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: SITE_CHAT_MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.any([
      request.signal,
      AbortSignal.timeout(SITE_CHAT_TIMEOUT_MS),
    ]),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        store: false,
      },
    },
  });

  return withLovableAiGatewayRunIdHeader(
    result.toUIMessageStreamResponse({
      originalMessages: messages,
      sendReasoning: false,
      headers: getLovableAiGatewayResponseHeaders(
        { "Cache-Control": "no-store" },
        { ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}) },
      ),
    }),
    runIdFetch,
  );
}

/** POST /api/chat: every guard runs before any model call (see siteChatGuard). */
export const handleSiteChatRequest = createSiteChatHandler({
  allowedOrigins: siteChatAllowedOrigins(siteConfig.identity.siteUrl),
  isConfigured: () => Boolean(process.env["LOVABLE_API_KEY"]),
  rateLimit: rateLimitSiteChat,
  stream: streamSiteChatReply,
});
