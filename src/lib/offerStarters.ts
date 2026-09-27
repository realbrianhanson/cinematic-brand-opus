import { emptyBuilder, pageRecipe } from "./offerBuilder";

export const offerStarterIds = [
  "lead-magnet",
  "sales",
  "external",
  "upsell",
] as const;
export type OfferStarter = (typeof offerStarterIds)[number];

/** Untrusted URL values must never choose arbitrary editor behavior. */
export function parseOfferStarter(value: unknown): OfferStarter | undefined {
  return typeof value === "string" &&
    offerStarterIds.includes(value as OfferStarter)
    ? (value as OfferStarter)
    : undefined;
}

export function validateOfferStarterSearch(search: Record<string, unknown>): {
  starter?: OfferStarter;
} {
  const starter = parseOfferStarter(search.starter);
  return starter ? { starter } : {};
}

export const offerStarterLabels: Record<
  OfferStarter,
  { title: string; description: string }
> = {
  "lead-magnet": {
    title: "Free download funnel",
    description:
      "Collect an email, deliver a free file, then offer a useful next step.",
  },
  sales: {
    title: "Product sales funnel",
    description:
      "Build your sales page, set the price and deliver a download after payment.",
  },
  external: {
    title: "External offer funnel",
    description:
      "Build your landing page here and send visitors to your provider for checkout or signup. Your provider handles delivery and follow-ups.",
  },
  upsell: {
    title: "Upsell or downsell offer",
    description:
      "Build an optional follow-up, then link it from another offer. Paid follow-ups use a separate checkout.",
  },
};

/** Fresh starter data only; persisted offers and draft recovery take priority. */
export function offerStarterDefaults(starter: OfferStarter) {
  const builder = emptyBuilder();
  const form = {
    checkoutMode:
      starter === "external" ? ("external" as const) : ("native" as const),
    kind: starter === "lead-magnet" ? ("free" as const) : ("paid" as const),
    priceDisplayMode:
      starter === "external" ? ("provider" as const) : ("fixed" as const),
    funnelOnly: starter === "upsell",
  };
  const context = {
    strategy: builder.strategy,
    offer: {
      title: "",
      summary: "",
      kind: form.kind,
      checkout_mode: form.checkoutMode,
    },
  };
  builder.presentation.landing = pageRecipe(
    starter === "external" ? "sales" : starter,
    context,
  );
  if (starter === "upsell") {
    builder.strategy.traffic = "customer";
    builder.presentation.upsell = pageRecipe("upsell", context);
  }
  return { form, builder };
}
