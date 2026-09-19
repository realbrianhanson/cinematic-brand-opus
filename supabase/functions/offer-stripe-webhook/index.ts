import {
  OFFER_ID,
  OfferError,
  paymentReadiness,
  readOfferWebhookBody,
  requirePayments,
  stripeEventMutation,
  type StripeEventInput,
} from "../_shared/offers.ts";
import {
  offerAdminClient,
  offerFailure,
  offerJson,
  offerStripe,
  Stripe,
} from "../_shared/offersRuntime.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return offerJson(405, { error: "Method not allowed" });
  try {
    const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    const webhook = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
    requirePayments(secret, webhook);
    const signature = req.headers.get("stripe-signature");
    if (!signature)
      throw new OfferError(
        400,
        "invalid_signature",
        "Missing webhook signature.",
      );
    const payload = await readOfferWebhookBody(req);
    const stripe = offerStripe(secret!);
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        webhook!,
        300,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      throw new OfferError(
        400,
        "invalid_signature",
        "Invalid webhook signature.",
      );
    }
    const mode = paymentReadiness(secret, webhook).mode;
    const mutation = stripeEventMutation(
      event as unknown as StripeEventInput,
      mode as "test" | "live",
    );
    if (!mutation) return offerJson(200, { received: true, ignored: true });
    const admin = offerAdminClient();
    if (mutation._event_type === "charge.refunded") {
      // A shared Stripe account may also refund purchases unrelated to this site.
      // Metadata distinguishes those from an offer whose paid event is still in flight.
      const { data: order, error } = await admin
        .from("offer_orders")
        .select("id")
        .eq("stripe_payment_intent_id", mutation._payment_intent_id!)
        .maybeSingle();
      if (error) throw error;
      if (!order) {
        const intent = await stripe.paymentIntents.retrieve(
          mutation._payment_intent_id!,
        );
        if (intent.metadata.integration !== "site-offers")
          return offerJson(200, { received: true, ignored: true });
        if (!OFFER_ID.test(intent.metadata.offer_order_id ?? ""))
          throw new OfferError(
            400,
            "invalid_payment_event",
            "Invalid offer payment event.",
          );
        // SQL intentionally refuses an unassociated intent without recording receipt.
        // Stripe retries after the original paid event associates it.
      }
    }
    const { data, error } = await admin.rpc(
      "offer_apply_stripe_event",
      mutation,
    );
    if (error) throw new Error("Payment event could not be applied");
    return offerJson(200, {
      received: true,
      duplicate: data?.duplicate === true,
    });
  } catch (error) {
    return offerFailure(error);
  }
});
