import sanitizeHtml from "sanitize-html";
import type { SiteConfig } from "@/config/site";
import { isBrianOwner } from "./informationPages";
import { offerPrice } from "./offers";
import { readPresentation } from "./offerBuilder";
import { hasOfferSectionContent } from "./offerSectionLayout";

export function publicHelpContext(config: SiteConfig): string {
  return [
    "/start-here: Choose a starting point based on what you want help with.",
    "/shop: Browse the currently published resources, tools and training. An external offer's provider determines current pricing and enrollment details.",
    isBrianOwner(config)
      ? "/first-ai-build: Free project planner. Choose a small business task to receive a plan, build prompt, fictional example and checks. No email, purchase or payment card is required. Use fictional practice information, not customer details."
      : "",
    "/support: Help with website downloads and purchases made elsewhere. The assistant cannot inspect orders, send access emails, process refunds, enroll visitors or change their accounts.",
    "/offer-access?recover=1: For resources claimed or purchased directly on this website, request a private access link using the original email address on that page. Never ask visitors to paste that email or a private access link into chat. Recovery does not confirm payment or promise that an email will arrive.",
    "Purchases from external checkout or membership providers use that provider's receipt, access instructions and support. They do not appear in this website's download recovery.",
    config.sections.speaking
      ? "/speaking: Submit an event inquiry for the team to review. An inquiry is not a confirmed booking; availability, terms and pricing need a human response."
      : "",
    "/privacy: Read the site's privacy information and measurement choices.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ChatCatalogRow {
  slug: string;
  title: string;
  summary: string | null;
  kind: "free" | "paid";
  checkout_mode: "native" | "external";
  price_display_mode: "fixed" | "provider";
  amount_minor: number;
  currency: string;
  shop_category: string | null;
  body?: string;
  presentation?: unknown;
}

const plain = (value: string, max: number) =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Published public fields only; private builder strategy and proof notes never enter chat. */
export function publishedProductContext(rows: ChatCatalogRow[]): string {
  const facts: Record<string, unknown>[] = [];
  let size = 0;
  for (const row of rows.slice(0, 40)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) continue;
    const presentation = readPresentation(row.presentation);
    const sections = presentation?.landing.sections ?? [];
    const structured = sections.some(hasOfferSectionContent);
    const item = {
      title: plain(row.title, 200),
      price: offerPrice(row),
      checkout: row.checkout_mode,
      category: row.shop_category ? plain(row.shop_category, 80) : undefined,
      summary: plain(row.summary || "", 600),
      details: structured ? undefined : plain(row.body || "", 900),
      sections: structured
        ? sections
            .filter(
              (section) =>
                hasOfferSectionContent(section) &&
                [
                  "text",
                  "benefits",
                  "method",
                  "deliverables",
                  "faq",
                  "guarantee",
                ].includes(section.type),
            )
            .slice(0, 8)
            .map((section) => ({
              type: section.type,
              heading: plain(section.heading, 150),
              body: plain(section.body, 600),
            }))
        : undefined,
      page: `/offers/${row.slug}`,
    };
    const length = JSON.stringify(item).length;
    if (size + length > 24000) break;
    facts.push(item);
    size += length;
  }
  return facts.length ? JSON.stringify(facts) : "";
}
