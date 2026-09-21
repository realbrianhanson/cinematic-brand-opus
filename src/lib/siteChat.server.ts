/**
 * Server-only: builds the assistant's grounding context from published products.
 *
 * Reads the public catalog with the publishable key (RLS), exactly like the shop
 * pages do, so the assistant can only describe products visitors can already see.
 */
import { createPublicServerClient } from "./publicData.server";
import { offerPrice } from "./offers";
import { siteConfig } from "@/config/site";

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
