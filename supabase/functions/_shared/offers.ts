/** Shared offer contracts without runtime/provider dependencies. */
export const OFFER_PUBLIC_COLUMNS =
  "id,slug,title,summary,body,cover_url,status,kind,amount_minor,currency,thank_you_message,funnel_only,created_at,updated_at,checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure,presentation";
export const OFFER_TOKEN = /^[0-9a-f]{64}$/;
export const OFFER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OFFER_CURRENCIES = new Set(["usd", "cad", "eur", "gbp", "aud"]);

export class OfferError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface OfferOrder {
  id: string;
  offer_id: string;
  parent_order_id: string | null;
  email: string;
  name: string | null;
  status: "pending" | "fulfilled" | "failed" | "expired" | "refunded";
  title_snapshot: string;
  asset_path_snapshot: string;
  asset_name_snapshot: string;
  amount_minor: number;
  currency: string;
  next_offer_id: string | null;
  next_offer_deadline: string | null;
  declined_at: string | null;
  stripe_session_id: string | null;
  stripe_checkout_url: string | null;
  checkout_expires_at: string | null;
  fulfilled_at: string | null;
}

export function requireToken(value: unknown): string {
  if (typeof value !== "string" || !OFFER_TOKEN.test(value)) {
    throw new OfferError(400, "invalid_token", "This access link is invalid.");
  }
  return value;
}

export function requireOfferId(value: unknown): string {
  if (typeof value !== "string" || !OFFER_ID.test(value)) {
    throw new OfferError(400, "invalid_offer", "Choose a valid offer.");
  }
  return value;
}

export function normalizedEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /[\r\n]/.test(email)
  ) {
    throw new OfferError(400, "invalid_email", "Enter a valid email address.");
  }
  return email;
}

export function normalizedName(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 200) {
    throw new OfferError(
      400,
      "invalid_name",
      "Name must be 200 characters or fewer.",
    );
  }
  return value.trim();
}

export function canonicalOfferOrigin(value: unknown): string {
  try {
    if (typeof value !== "string") throw new Error();
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new OfferError(
      503,
      "site_unavailable",
      "The site address needs to be configured.",
    );
  }
}

export function paymentReadiness(secret?: string, webhook?: string) {
  const match = /^(?:sk|rk)_(test|live)_\S+$/.exec(secret?.trim() ?? "");
  const webhookConfigured = /^whsec_\S+$/.test(webhook?.trim() ?? "");
  return {
    secret_configured: !!match,
    webhook_configured: webhookConfigured,
    payments_ready: !!match && webhookConfigured,
    mode: (match?.[1] ?? "unconfigured") as "test" | "live" | "unconfigured",
  };
}

export function requirePayments(secret?: string, webhook?: string) {
  if (!paymentReadiness(secret, webhook).payments_ready) {
    throw new OfferError(
      503,
      "payments_unavailable",
      "Paid checkout is not available yet.",
    );
  }
}

export async function hashOfferToken(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function accessUrl(origin: string, token: string): string {
  return `${canonicalOfferOrigin(origin)}/offer-access#token=${requireToken(token)}`;
}

export function safeCheckoutUrl(value: unknown): string | null {
  try {
    if (typeof value !== "string") return null;
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "checkout.stripe.com" &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function publicOrder(order: OfferOrder) {
  return {
    id: order.id,
    title: order.title_snapshot,
    status: order.status,
    kind: order.amount_minor === 0 ? "free" : "paid",
    amount_minor: order.amount_minor,
    currency: order.currency,
    asset_name: order.asset_name_snapshot,
    fulfilled_at: order.fulfilled_at,
  };
}

export function nextOfferAvailable(
  order: OfferOrder,
  hasChild: boolean,
  now = Date.now(),
): boolean {
  return (
    order.status === "fulfilled" &&
    !!order.next_offer_id &&
    !order.declined_at &&
    !hasChild &&
    (!order.next_offer_deadline || Date.parse(order.next_offer_deadline) > now)
  );
}

/** Same immutable input and idempotency key on every retry, including lost responses. */
export function checkoutRequest(
  order: OfferOrder,
  token: string,
  origin: string,
  now = Date.now(),
) {
  const expiry = Math.floor(Date.parse(order.checkout_expires_at ?? "") / 1000);
  if (
    order.status !== "pending" ||
    !Number.isFinite(expiry) ||
    expiry <= Math.ceil(now / 1000)
  ) {
    throw new OfferError(
      409,
      "checkout_window_closed",
      "This checkout could not be started. Check your access page for its current status.",
    );
  }
  if (
    !Number.isSafeInteger(order.amount_minor) ||
    order.amount_minor <= 0 ||
    !OFFER_CURRENCIES.has(order.currency)
  ) {
    throw new OfferError(
      409,
      "invalid_price",
      "This offer's price needs to be corrected.",
    );
  }
  // Keep the original expiry on retries. Stripe can replay an existing session
  // even with <30 minutes left; it rejects a genuinely new session that is too short.
  const metadata = { offer_order_id: order.id, integration: "site-offers" };
  return {
    mode: "payment" as const,
    payment_method_types: ["card" as const],
    client_reference_id: order.id,
    customer_email: order.email,
    line_items: [
      {
        price_data: {
          currency: order.currency,
          unit_amount: order.amount_minor,
          product_data: { name: order.title_snapshot },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: accessUrl(origin, token),
    cancel_url: accessUrl(origin, token),
    expires_at: expiry,
  };
}

export interface OfferCheckoutProvider {
  create: (
    input: ReturnType<typeof checkoutRequest>,
    idempotencyKey: string,
  ) => Promise<{
    id: string;
    url: string | null;
    paymentIntentId: string | null;
  }>;
  record: (
    orderId: string,
    session: { id: string; url: string; paymentIntentId: string | null },
  ) => Promise<void>;
}

/** Provider operations are injected so retry and missing-key behavior are testable without charging. */
export async function claimReservedOffer(input: {
  paid: boolean;
  checkoutMode?: "native" | "external";
  secret?: string;
  webhook?: string;
  token: string;
  origin: string;
  reserve: () => Promise<OfferOrder>;
  provider: OfferCheckoutProvider;
  now?: number;
}) {
  // External listings never reserve local orders, even when Stripe is configured.
  // Existing-token retries explicitly use native mode because delivery comes from
  // the immutable order snapshot, not the offer's current presentation mode.
  if (input.checkoutMode !== undefined && input.checkoutMode !== "native") {
    throw new OfferError(
      409,
      "external_checkout",
      "This offer is available on the provider's website.",
    );
  }
  if (input.paid) requirePayments(input.secret, input.webhook);
  const order = await input.reserve();
  if (!order?.id) throw new Error("Order reservation failed");
  const url = accessUrl(input.origin, input.token);
  if (order.status !== "pending")
    return { status: order.status, access_url: url };
  requirePayments(input.secret, input.webhook);
  const now = input.now ?? Date.now();
  const storedCheckout = safeCheckoutUrl(order.stripe_checkout_url);
  if (storedCheckout && Date.parse(order.checkout_expires_at ?? "") > now) {
    return {
      status: "pending" as const,
      checkout_url: storedCheckout,
      access_url: url,
    };
  }
  if (order.stripe_session_id) {
    throw new OfferError(
      409,
      "checkout_window_closed",
      "Check your access page for the latest payment status.",
    );
  }
  const session = await input.provider.create(
    checkoutRequest(order, input.token, input.origin, now),
    `site-offer-${order.id}`,
  );
  const checkoutUrl = safeCheckoutUrl(session.url);
  if (!checkoutUrl) throw new Error("Checkout did not return a valid URL");
  await input.provider.record(order.id, { ...session, url: checkoutUrl });
  return {
    status: "pending" as const,
    checkout_url: checkoutUrl,
    access_url: url,
  };
}

type SessionObject = Record<string, unknown>;
export interface StripeEventInput {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: SessionObject };
}
export interface OfferStripeMutation {
  _event_id: string;
  _event_type: string;
  _session_id: string | null;
  _order_id: string | null;
  _payment_intent_id: string | null;
  _amount_minor: number | null;
  _currency: string | null;
}
function objectId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
  return null;
}

/** Only authenticated Stripe events reach this mapper, never browser returns. */
export function stripeEventMutation(
  event: StripeEventInput,
  mode: "test" | "live",
): OfferStripeMutation | null {
  if (event.livemode !== (mode === "live")) {
    throw new OfferError(
      400,
      "wrong_payment_mode",
      "Webhook payment mode does not match configuration.",
    );
  }
  const obj = event.data.object;
  const base: OfferStripeMutation = {
    _event_id: event.id,
    _event_type: event.type,
    _session_id: null,
    _order_id: null,
    _payment_intent_id: objectId(obj.payment_intent),
    _amount_minor: null,
    _currency: null,
  };
  if (event.type === "charge.refunded") {
    if (!base._payment_intent_id) return null;
    return base;
  }
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  )
    return null;
  const metadata = obj.metadata as Record<string, unknown> | null;
  if (metadata?.integration !== "site-offers") return null;
  if (
    typeof metadata.offer_order_id !== "string" ||
    !OFFER_ID.test(metadata.offer_order_id) ||
    obj.mode !== "payment" ||
    typeof obj.id !== "string"
  ) {
    throw new OfferError(
      400,
      "invalid_payment_event",
      "Invalid offer payment event.",
    );
  }
  base._order_id = metadata.offer_order_id;
  base._session_id = obj.id;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (obj.payment_status !== "paid") return null;
    if (
      typeof obj.amount_total !== "number" ||
      !Number.isSafeInteger(obj.amount_total) ||
      obj.amount_total <= 0 ||
      typeof obj.currency !== "string" ||
      !OFFER_CURRENCIES.has(obj.currency) ||
      !base._payment_intent_id
    ) {
      throw new OfferError(
        400,
        "invalid_payment_event",
        "Invalid offer payment amount.",
      );
    }
    base._amount_minor = obj.amount_total;
    base._currency = obj.currency;
  }
  return base;
}

/** Preserve exact UTF-8 body for Stripe signature verification, with an allocation cap. */
export async function readOfferWebhookBody(
  request: Request,
  limit = 1_048_576,
): Promise<string> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > limit)
  ) {
    throw new OfferError(
      413,
      "payload_too_large",
      "Webhook payload is too large.",
    );
  }
  if (!request.body)
    throw new OfferError(400, "invalid_body", "Missing webhook body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new OfferError(
          413,
          "payload_too_large",
          "Webhook payload is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OfferError(400, "invalid_body", "Invalid webhook body.");
  }
}
