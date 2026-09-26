/** The public settings an admin must see before publishing or restoring. */
export type OfferChangeValues = {
  status?: string | null;
  slug?: string | null;
  kind?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  checkout_mode?: string | null;
  price_display_mode?: string | null;
  asset_path?: string | null;
  asset_name?: string | null;
  next_offer_id?: string | null;
  bump_offer_id?: string | null;
  downsell_offer_id?: string | null;
  next_offer_window_minutes?: number | null;
  external_url?: string | null;
};
export type OfferChange = { label: string; before: string; after: string };

const statusNames: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function priceText(values: OfferChangeValues): string {
  if (
    values.checkout_mode === "external" &&
    values.price_display_mode === "provider"
  )
    return "Current pricing on destination";
  if (values.kind !== "paid") return "Free";
  const amount = ((values.amount_minor ?? 0) / 100).toFixed(2);
  return `${(values.currency || "usd").toUpperCase()} ${amount}`;
}
function fileText(values: OfferChangeValues): string {
  if (values.checkout_mode === "external" || !values.asset_path) return "None";
  return values.asset_name || "Unnamed file";
}
function checkoutText(values: OfferChangeValues): string {
  return values.checkout_mode === "external"
    ? `External link · ${values.external_url || "no destination yet"}`
    : "Website checkout / download";
}
function followUpText(
  values: OfferChangeValues,
  offerTitle: (id: string) => string,
): string {
  if (values.checkout_mode === "external" || !values.next_offer_id)
    return "None";
  const title = offerTitle(values.next_offer_id) || "Selected offer";
  const window = values.next_offer_window_minutes ?? 0;
  return window ? `${title} · ${window}-minute window` : title;
}

/**
 * Differences between two versions of an offer's public settings, in the
 * order an admin should read them. `before` null means the offer is new.
 */
export function offerChanges(
  before: OfferChangeValues | null,
  after: OfferChangeValues,
  { offerTitle = () => "" }: { offerTitle?: (id: string) => string } = {},
): OfferChange[] {
  const changes: OfferChange[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, before: from, after: to });
  };
  if (after.status)
    add(
      "Status",
      before?.status
        ? statusNames[before.status] || before.status
        : "Not yet created",
      statusNames[after.status] || after.status,
    );
  if (!before) return changes;
  add(
    "Page URL",
    `/offers/${before.slug || ""}`,
    `/offers/${after.slug || ""}`,
  );
  add("Price", priceText(before), priceText(after));
  const beforeFile = fileText(before);
  const afterFile = fileText(after);
  add(
    "Download file",
    beforeFile,
    afterFile !== "None" &&
      afterFile === beforeFile &&
      before.asset_path !== after.asset_path
      ? `${afterFile} (new upload)`
      : afterFile,
  );
  add("Checkout", checkoutText(before), checkoutText(after));
  add(
    "Follow-up",
    followUpText(before, offerTitle),
    followUpText(after, offerTitle),
  );
  for (const [field, label] of [
    ["bump_offer_id", "Optional checkout extra"],
    ["downsell_offer_id", "Alternative after decline"],
  ] as const) {
    if ((before[field] ?? null) !== (after[field] ?? null))
      changes.push({
        label,
        before: before[field]
          ? offerTitle(before[field]!) || "Selected offer"
          : "None",
        after: after[field]
          ? offerTitle(after[field]!) || "Selected offer"
          : "None",
      });
  }
  return changes;
}

// Everything a builder draft can change on the live offer, except status,
// which the list and Review step change directly without touching the draft.
const contentKeys = [
  "slug",
  "title",
  "summary",
  "body",
  "cover_url",
  "kind",
  "amount_minor",
  "currency",
  "asset_path",
  "asset_name",
  "thank_you_message",
  "next_offer_id",
  "bump_offer_id",
  "downsell_offer_id",
  "next_offer_window_minutes",
  "funnel_only",
  "show_in_shop",
  "shop_category",
  "shop_featured",
  "checkout_mode",
  "price_display_mode",
  "external_url",
  "external_button_text",
  "is_affiliate",
  "affiliate_disclosure",
  "presentation",
] as const;

/** True when two offer rows differ at most in status and timestamps. */
export function sameOfferContent(
  live: Record<string, unknown>,
  base: Record<string, unknown>,
): boolean {
  return contentKeys.every(
    (key) =>
      JSON.stringify(live[key] ?? null) === JSON.stringify(base[key] ?? null),
  );
}
