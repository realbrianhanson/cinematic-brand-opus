import { readPresentation } from "./offerBuilder";
import { freeOfferButtonLabel } from "./offerClaim";
import { offerPrice, type PublicOffer } from "./offers";

/** Resolve the action visitors actually see, retaining legacy external labels. */
export function offerPrimaryCta(offer: PublicOffer): string {
  const authored = readPresentation(offer.presentation)?.landing.ctaText.trim();
  if (authored) return authored;
  if (offer.checkout_mode === "external")
    return offer.external_button_text.trim() || "Visit website";
  return offer.kind === "free"
    ? freeOfferButtonLabel(offer)
    : "Continue to checkout";
}

/** An unfinished draft price must never look like a confirmed zero price. */
export function offerPreviewPrice(offer: PublicOffer): string {
  if (
    offer.kind === "paid" &&
    !(
      offer.checkout_mode === "external" &&
      offer.price_display_mode === "provider"
    ) &&
    offer.amount_minor < 50
  )
    return "Price not set";
  return offerPrice(offer);
}
