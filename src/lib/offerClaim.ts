import { measurementForClaim } from "@/lib/measurement";
import {
  clearOfferAttempt,
  invokeOfferApi,
  persistOfferToken,
  safeOfferRedirect,
  type OfferClaim,
  type PublicOffer,
} from "@/lib/offers";
import type { SubscribeUiResult } from "@/lib/newsletterClient";
import { subscribeToNewsletter } from "@/lib/newsletterSubscribe";
import { withTimeout } from "@/lib/withTimeout";

/** Newsletter source tag for people who opt in while claiming the free kit. */
export const STARTER_KIT_SOURCE = "starter-kit";

/** The opt-in never holds the download hostage: give up after this long. */
export const OPT_IN_TIMEOUT_MS = 4000;

export type OfferRequestResult =
  { status: "closed" } | { status: "ready"; destination: string };

/**
 * Claims a native offer (free download or paid checkout) and returns the
 * verified destination. A terminal previous attempt is reported as `closed`
 * so the caller can ask the visitor to submit again with a fresh token.
 */
export async function requestOfferAccess(input: {
  offerId: string;
  bumpOfferId?: string;
  email: string;
  name?: string;
  token: string;
}): Promise<OfferRequestResult> {
  persistOfferToken(input.token);
  const result = await invokeOfferApi<OfferClaim>({
    action: "claim",
    measurement: await measurementForClaim(),
    offer_id: input.offerId,
    ...(input.bumpOfferId ? { bump_offer_id: input.bumpOfferId } : {}),
    email: input.email,
    name: input.name ?? "",
    token: input.token,
  });
  if (["expired", "failed", "refunded"].includes(result.status)) {
    clearOfferAttempt(input.offerId, input.email);
    return { status: "closed" };
  }
  return {
    status: "ready",
    destination: safeOfferRedirect(result.checkout_url || result.access_url),
  };
}

/**
 * Starts the double opt-in for a visitor who ticked the consent box. The
 * newsletter endpoint only sends a confirmation email; nothing else happens
 * until the visitor confirms. Failures are swallowed so the download always
 * opens.
 */
export async function optInAfterClaim(
  email: string,
  consent: boolean,
  source: string = STARTER_KIT_SOURCE,
): Promise<SubscribeUiResult | null> {
  if (!consent) return null;
  try {
    return await withTimeout(
      subscribeToNewsletter(email, source),
      OPT_IN_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
}

/** Button label for a free download, in Brian's words when it is a kit. */
export function freeOfferButtonLabel(
  offer: Pick<PublicOffer, "title">,
): string {
  return /\bkit\b/i.test(offer.title)
    ? "Send Me the Kit"
    : "Send Me the Free Download";
}
