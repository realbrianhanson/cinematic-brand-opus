import { readBoundedJson } from "../_shared/boundedJson.ts";
import {
  bindOrderMeasurement,
  recordDownloadMeasurement,
} from "../_shared/conversionOrders.ts";
import {
  backgroundOfferDelivery,
  deliverOfferAccess,
  offerDeliveryOverview,
  offerDeliveryState,
  prepareOfferDelivery,
  resolveOfferMailer,
  resolveOrderTokenHash,
} from "../_shared/offerAccessMailRuntime.ts";
import {
  accessUrl,
  authorizedOrderItem,
  effectiveFollowUpId,
  publicOrderItems,
  type OfferOrderItem,
  claimReservedOffer,
  hashOfferToken,
  nextOfferAvailable,
  normalizedEmail,
  normalizedName,
  OFFER_PUBLIC_COLUMNS,
  OfferError,
  type OfferOrder,
  paymentReadiness,
  publicOrder,
  requireOfferId,
  requireToken,
  safeCheckoutUrl,
} from "../_shared/offers.ts";
import {
  offerAdminClient,
  offerDatabaseError,
  offerFailure,
  offerIpThrottle,
  offerJson,
  offerOrigin,
  offerStripe,
  offerThrottle,
  requireOfferAdmin,
} from "../_shared/offersRuntime.ts";
import {
  checkoutRecoveryState,
  recoverOfferCheckout,
} from "../_shared/offerCheckoutRecovery.ts";
import { handleDeliveryRetry } from "./deliveryRetry.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return offerJson(200, { ok: true });
  if (req.method !== "POST")
    return offerJson(405, { error: "Method not allowed" });
  try {
    const body = await readBoundedJson(req, 4096);
    if (!body || typeof body.action !== "string")
      throw new OfferError(400, "invalid_request", "Invalid offer request.");
    const action = body.action;
    if (
      ![
        "get",
        "preview",
        "health",
        "claim",
        "status",
        "download",
        "decline",
        "recover",
        "email_access",
        "retry_deliveries",
        "retry_checkout",
      ].includes(action)
    )
      throw new OfferError(400, "invalid_action", "Unknown offer action.");
    const admin = offerAdminClient();
    const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    const webhook = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
    const readiness = paymentReadiness(secret, webhook);
    const withBump = async <T extends { id: string }>(offer: T | null) => {
      if (!offer) return null;
      const { data, error } = await admin.rpc("offer_public_bump", {
        _offer_id: offer.id,
      });
      if (error) throw error;
      return { ...offer, bump_offer: data ?? null };
    };

    if (action === "retry_deliveries")
      return await handleDeliveryRetry(req, body, admin);
    if (action === "health" || action === "preview") {
      await requireOfferAdmin(req, admin);
      if (action === "health") {
        const mailer = await resolveOfferMailer(admin);
        const { count: deliveryPending, error: pendingError } = await admin
          .from("offer_access_deliveries")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "sending"]);
        const { count: deliveryReview, error: reviewError } = await admin
          .from("offer_access_deliveries")
          .select("id", { count: "exact", head: true })
          .eq("status", "needs_review");
        if (pendingError || reviewError)
          throw new Error("Delivery overview unavailable");
        return offerJson(200, {
          ...readiness,
          payments_ready: readiness.payments_ready && mailer.ok,
          delivery_ready: mailer.ok,
          delivery_missing: mailer.ok ? [] : mailer.missing,
          delivery_pending: deliveryPending ?? 0,
          delivery_needs_review: deliveryReview ?? 0,
          ...(await offerDeliveryOverview(admin)),
          webhook_url: `${Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/offer-stripe-webhook`,
        });
      }
      const id = requireOfferId(body.offer_id);
      const { data, error } = await admin
        .from("offers")
        .select(`${OFFER_PUBLIC_COLUMNS},bump_offer_id`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      let previewOffer = null;
      if (data) {
        const { bump_offer_id, ...safeOffer } = data;
        let bump = null;
        if (data.checkout_mode === "native" && bump_offer_id) {
          const { data: target, error: targetError } = await admin
            .from("offers")
            .select(
              "id,slug,title,summary,cover_url,kind,amount_minor,currency",
            )
            .eq("id", bump_offer_id)
            .eq("status", "published")
            .eq("checkout_mode", "native")
            .eq("kind", "paid")
            .eq("currency", data.currency)
            .maybeSingle();
          if (targetError) throw targetError;
          if (target) {
            const {
              id,
              slug,
              title,
              summary,
              cover_url,
              kind,
              amount_minor,
              currency,
            } = target;
            bump = {
              id,
              slug,
              title,
              summary,
              cover_url,
              kind,
              amount_minor,
              currency,
            };
          }
        }
        previewOffer = { ...safeOffer, bump_offer: bump };
      }
      return offerJson(200, {
        offer: previewOffer,
        payments_ready:
          readiness.payments_ready && (await resolveOfferMailer(admin)).ok,
      });
    }

    await offerIpThrottle(admin, req, action);
    if (action === "recover") {
      const email = normalizedEmail(body.email);
      if (body.website) return offerJson(200, { accepted: true });
      const mailer = await resolveOfferMailer(admin);
      if (!mailer.ok)
        throw new OfferError(
          503,
          "delivery_unavailable",
          "Email recovery is temporarily unavailable. Use a saved private access link or contact support.",
        );
      try {
        await offerThrottle(
          admin,
          `email:recover:${await hashOfferToken(email)}`,
          3,
          86400,
        );
      } catch (error) {
        if (error instanceof OfferError && error.status === 429)
          return offerJson(200, { accepted: true });
        throw error;
      }
      const deliveryId = await prepareOfferDelivery(admin, { email });
      if (deliveryId)
        backgroundOfferDelivery(deliverOfferAccess(admin, deliveryId));
      return offerJson(200, { accepted: true });
    }
    if (action === "get") {
      if (
        typeof body.slug !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) ||
        body.slug.length > 160
      )
        throw new OfferError(400, "invalid_slug", "Invalid offer address.");
      const { data, error } = await admin
        .from("offers")
        .select(OFFER_PUBLIC_COLUMNS)
        .eq("slug", body.slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      const mailer = await resolveOfferMailer(admin);
      return offerJson(200, {
        offer: await withBump(data),
        payments_ready: readiness.payments_ready && mailer.ok,
      });
    }

    const token = requireToken(body.token);
    const suppliedHash = await hashOfferToken(token);
    const resolvedHash = await resolveOrderTokenHash(admin, suppliedHash);
    if (action === "claim" && resolvedHash && resolvedHash !== suppliedHash)
      throw new OfferError(
        409,
        "request_mismatch",
        "Use a new request for this offer.",
      );
    const tokenHash =
      action === "claim" ? suppliedHash : (resolvedHash ?? suppliedHash);
    await offerThrottle(
      admin,
      `token:${action}:${tokenHash}`,
      action === "claim"
        ? 12
        : action === "email_access" || action === "retry_checkout"
          ? 4
          : 240,
    );
    const origin = await offerOrigin(admin);

    if (action === "claim") {
      const offerId = requireOfferId(body.offer_id);
      const bumpId =
        body.bump_offer_id == null ? null : requireOfferId(body.bump_offer_id);
      const parentHash =
        body.parent_token === undefined
          ? null
          : await resolveOrderTokenHash(
              admin,
              await hashOfferToken(requireToken(body.parent_token)),
            );
      if (body.parent_token !== undefined && !parentHash)
        throw new OfferError(
          404,
          "access_not_found",
          "This access link was not found.",
        );
      let email: string;
      let name = normalizedName(body.name);
      if (parentHash) {
        const { data: parent, error } = await admin
          .from("offer_orders")
          .select("email,name")
          .eq("token_hash", parentHash)
          .maybeSingle();
        if (error) throw error;
        if (!parent)
          throw new OfferError(
            404,
            "access_not_found",
            "This access link was not found.",
          );
        email =
          body.email === undefined
            ? normalizedEmail(parent.email)
            : normalizedEmail(body.email);
        if (email !== parent.email)
          throw new OfferError(
            409,
            "request_mismatch",
            "Use the original access link for this offer.",
          );
        if (body.name === undefined) name = parent.name ?? "";
      } else email = normalizedEmail(body.email);
      await offerThrottle(
        admin,
        `email:claim:${await hashOfferToken(email)}`,
        12,
      );
      const { data: existing, error: existingError } = await admin
        .from("offer_orders")
        .select("status,amount_minor")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (existingError) throw existingError;
      let paid = existing?.status === "pending" && existing.amount_minor > 0;
      let checkoutMode: "native" | "external" = "native";
      if (!existing) {
        const { data: offer, error: offerError } = await admin
          .from("offers")
          .select("kind,checkout_mode,bump_offer_id")
          .eq("id", offerId)
          .eq("status", "published")
          .maybeSingle();
        if (offerError) throw offerError;
        if (!offer)
          throw new OfferError(
            404,
            "offer_not_found",
            "This offer is not currently available.",
          );
        if (bumpId && bumpId !== offer.bump_offer_id)
          throw new OfferError(
            409,
            "invalid_bump",
            "This optional extra is not currently available.",
          );
        paid = offer.kind === "paid" || !!bumpId;
        checkoutMode = offer.checkout_mode;
      }
      if (
        paid &&
        checkoutMode !== "external" &&
        !(await resolveOfferMailer(admin)).ok
      )
        throw new OfferError(
          503,
          "delivery_unavailable",
          "Paid checkout is unavailable until download email delivery is configured.",
        );
      let reservedOrder: OfferOrder | null = null;
      const result = await claimReservedOffer({
        paid,
        checkoutMode,
        secret,
        webhook,
        token,
        origin,
        reserve: async () => {
          const { data, error } = await admin.rpc("offer_reserve_order", {
            _offer_id: offerId,
            _token_hash: tokenHash,
            _email: email,
            _name: name,
            _parent_hash: parentHash,
            _bump_offer_id: bumpId,
          });
          if (error) throw offerDatabaseError(error);
          reservedOrder = data as OfferOrder;
          await bindOrderMeasurement(admin, {
            request: req,
            measurement: body.measurement,
            origin,
            anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
            orderId: reservedOrder.id,
            paymentMode: readiness.mode,
          });
          return reservedOrder;
        },
        provider: {
          create: async (input, idempotencyKey) => {
            const session = await offerStripe(secret!).checkout.sessions.create(
              input,
              { idempotencyKey },
            );
            return {
              id: session.id,
              url: session.url,
              paymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
            };
          },
          record: async (orderId, session, attempt) => {
            const { error } = await admin.rpc("offer_record_checkout", {
              _order_id: orderId,
              _session_id: session.id,
              _checkout_url: session.url,
              _payment_intent_id: session.paymentIntentId,
              _checkout_attempt: attempt ?? 1,
            });
            if (error) throw new Error("Checkout association failed");
          },
        },
      });
      if (result.status === "fulfilled" && reservedOrder) {
        const orderId = (reservedOrder as OfferOrder).id;
        backgroundOfferDelivery(
          (async () => {
            const deliveryId = await prepareOfferDelivery(admin, { orderId });
            if (deliveryId) await deliverOfferAccess(admin, deliveryId);
          })(),
        );
      }
      return offerJson(200, result);
    }

    const { data: rawOrder, error: orderError } = await admin
      .from("offer_orders")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!rawOrder)
      throw new OfferError(
        404,
        "access_not_found",
        "This access link was not found.",
      );
    const { data: items, error: itemsError } = await admin
      .from("offer_order_items")
      .select("*")
      .eq("order_id", rawOrder.id)
      .order("role", { ascending: false });
    if (itemsError) throw itemsError;
    const order: OfferOrder = {
      ...(rawOrder as OfferOrder),
      items: (items ?? []) as OfferOrderItem[],
    };
    let recoveryParent: OfferOrder | null = null;
    if (
      (action === "status" || action === "retry_checkout") &&
      order.parent_order_id
    ) {
      const { data, error } = await admin
        .from("offer_orders")
        .select("status,declined_at,next_offer_deadline")
        .eq("id", order.parent_order_id)
        .maybeSingle();
      if (error) throw error;
      recoveryParent = data as OfferOrder | null;
    }
    if (action === "retry_checkout") {
      if (!(await resolveOfferMailer(admin)).ok)
        throw new OfferError(
          503,
          "delivery_unavailable",
          "Paid checkout is unavailable until download email delivery is configured.",
        );
      const stripe = offerStripe(secret ?? "");
      const result = await recoverOfferCheckout({
        order,
        parent: recoveryParent,
        token,
        origin,
        secret,
        webhook,
        retrieve: async (sessionId) =>
          await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["payment_intent"],
          }),
        prepare: async (previous, paymentIntentId) => {
          const { data, error } = await admin.rpc(
            "offer_prepare_checkout_retry",
            {
              _order_id: previous.id,
              _session_id: previous.stripe_session_id,
              _checkout_attempt: previous.checkout_attempt ?? 1,
              _payment_intent_id: paymentIntentId,
              _token_hash: suppliedHash,
              _origin: origin,
            },
          );
          if (error) throw offerDatabaseError(error);
          return { ...(data as OfferOrder), items: order.items };
        },
        provider: {
          create: async (input, idempotencyKey) => {
            const session = await stripe.checkout.sessions.create(input, {
              idempotencyKey,
            });
            return {
              id: session.id,
              url: session.url,
              paymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
            };
          },
          record: async (orderId, session, attempt) => {
            const { error } = await admin.rpc("offer_record_checkout", {
              _order_id: orderId,
              _session_id: session.id,
              _checkout_url: session.url,
              _payment_intent_id: session.paymentIntentId,
              _checkout_attempt: attempt ?? 1,
            });
            if (error) throw new Error("Checkout association failed");
          },
        },
      });
      return offerJson(200, result);
    }
    if (action === "email_access") {
      if (order.status !== "fulfilled")
        throw new OfferError(
          409,
          "delivery_unavailable",
          "Email access is available after the download is unlocked.",
        );
      if (!(await resolveOfferMailer(admin)).ok)
        throw new OfferError(
          503,
          "delivery_unavailable",
          "Email delivery is unavailable. Save your private access link and contact support if needed.",
        );
      const deliveryId = await prepareOfferDelivery(admin, {
        orderId: order.id,
      });
      if (deliveryId) await deliverOfferAccess(admin, deliveryId);
      return offerJson(200, {
        delivery_state: await offerDeliveryState(admin, order.id),
      });
    }
    if (action === "download") {
      const item = authorizedOrderItem(order, body.item_id);
      const filename =
        Array.from(item.asset_name_snapshot)
          .filter(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          )
          .join("")
          .slice(0, 200) || "download";
      const { data, error } = await admin.storage
        .from("offer-files")
        .createSignedUrl(item.asset_path_snapshot, 300, {
          download: filename,
        });
      if (error || !data?.signedUrl)
        throw new OfferError(
          503,
          "download_unavailable",
          "The file could not be prepared. Please try again.",
        );
      await recordDownloadMeasurement(admin, order.id);
      return offerJson(200, { url: data.signedUrl, filename });
    }
    if (action === "decline") {
      const { error } = await admin.rpc("offer_decline_next", {
        _token_hash: tokenHash,
        _offer_id:
          body.offer_id === undefined ? null : requireOfferId(body.offer_id),
      });
      if (error) throw offerDatabaseError(error);
      return offerJson(200, { ok: true });
    }

    let nextOffer = null;
    if (nextOfferAvailable(order, false)) {
      const { data: child, error: childError } = await admin
        .from("offer_orders")
        .select("id")
        .eq("parent_order_id", order.id)
        .limit(1)
        .maybeSingle();
      if (childError) throw childError;
      if (nextOfferAvailable(order, !!child)) {
        const { data, error } = await admin
          .from("offers")
          .select(OFFER_PUBLIC_COLUMNS)
          .eq("id", effectiveFollowUpId(order)!)
          .eq("status", "published")
          .eq("checkout_mode", "native")
          .maybeSingle();
        if (error) throw error;
        nextOffer = await withBump(data);
      }
    }
    const { data: offerCopy, error: copyError } = await admin
      .from("offers")
      .select("thank_you_message,presentation")
      .eq("id", order.offer_id)
      .maybeSingle();
    if (copyError) throw copyError;
    const mailer = await resolveOfferMailer(admin);
    return offerJson(200, {
      order: publicOrder(order),
      items: publicOrderItems(order),
      follow_up_stage: nextOffer
        ? order.upsell_declined_at
          ? "downsell"
          : "upsell"
        : null,
      checkout_recovery: checkoutRecoveryState(order, recoveryParent),
      thank_you_message: offerCopy?.thank_you_message ?? "",
      presentation: offerCopy?.presentation ?? null,
      next_offer: nextOffer,
      next_offer_deadline: nextOffer ? order.next_offer_deadline : null,
      checkout_url:
        order.status === "pending" &&
        Date.parse(order.checkout_expires_at ?? "") > Date.now()
          ? safeCheckoutUrl(order.stripe_checkout_url)
          : null,
      access_url: accessUrl(origin, token),
      payments_ready: readiness.payments_ready && mailer.ok,
      delivery_state:
        order.status === "fulfilled"
          ? await offerDeliveryState(admin, order.id, suppliedHash)
          : "not_sent",
      delivery_ready: mailer.ok,
    });
  } catch (error) {
    return offerFailure(error);
  }
});
