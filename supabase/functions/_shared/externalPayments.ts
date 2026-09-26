/** External payments are operational facts, never browser/session attribution. */
export const EXTERNAL_STRIPE_API_VERSION = "2025-03-31.basil";
export const EXTERNAL_PAYMENT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.payment_succeeded",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;
export type PaymentMode = "live" | "test";
type Obj = Record<string, unknown>;
export class ExternalPaymentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
  }
}
export interface ExternalPriceMapping {
  price_id: string;
  product_id: string;
  destination: string;
}
export interface ExternalPaymentConfig {
  enabled: boolean;
  mode: PaymentMode;
  accountId: string;
  scope: "self" | "connected";
  secret: string;
  webhookSecret: string;
  prices: ExternalPriceMapping[];
}
const ID = /^[a-z]+_[A-Za-z0-9_]{1,180}$/;
export function paymentObject(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExternalPaymentError("invalid_provider_object");
  return value as Obj;
}
export function paymentId(value: unknown, prefix: string): string {
  const id =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? (value as Obj).id
        : null;
  if (typeof id !== "string" || !ID.test(id) || !id.startsWith(prefix + "_"))
    throw new ExternalPaymentError("invalid_provider_id");
  return id;
}
export function externalPaymentConfig(
  env: (name: string) => string | undefined,
): ExternalPaymentConfig {
  const read = (name: string) => env("EXTERNAL_STRIPE_" + name)?.trim() ?? "";
  const mode = read("MODE"),
    scope = read("ACCOUNT_SCOPE"),
    accountId = read("ACCOUNT_ID");
  const secret = read("SECRET_KEY"),
    webhookSecret = read("WEBHOOK_SECRET");
  if (
    !/^(test|live)$/.test(mode) ||
    !/^(self|connected)$/.test(scope) ||
    !/^acct_[A-Za-z0-9]+$/.test(accountId) ||
    !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(secret) ||
    !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)
  )
    throw new ExternalPaymentError("configuration_incomplete");
  let prices: ExternalPriceMapping[];
  try {
    const parsed: unknown = JSON.parse(read("PRICE_MAP"));
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50)
      throw new Error();
    prices = parsed.map((value) => {
      const row = paymentObject(value);
      if (
        Object.keys(row).sort().join(",") !==
          "destination,price_id,product_id" ||
        typeof row.destination !== "string" ||
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.destination)
      )
        throw new Error();
      return {
        price_id: paymentId(row.price_id, "price"),
        product_id: paymentId(row.product_id, "prod"),
        destination: row.destination,
      };
    });
    if (new Set(prices.map((p) => p.price_id)).size !== prices.length)
      throw new Error();
  } catch {
    throw new ExternalPaymentError("invalid_price_map");
  }
  const enabled =
    read("ENABLED") === "true" &&
    (mode === "test" ||
      read("LIVE_ACK") === "I_VERIFIED_ACCOUNT_PRODUCTS_AND_TEST_FLOW");
  return {
    enabled,
    mode: mode as PaymentMode,
    scope: scope as "self" | "connected",
    accountId,
    secret,
    webhookSecret,
    prices,
  };
}
export interface ExternalPaymentFact {
  payment_id: string;
  charge_id: string;
  destination: string;
  amount_minor: number;
  refunded_minor: number;
  currency: string;
  occurred_at: string;
  price_ids: string[];
  refresh_fence: string;
}
export type AcquirePaymentRefresh = (paymentId: string) => Promise<string>;
export type PaymentResolution =
  "applied" | "unmapped" | "unsupported" | "not_paid";
export interface ExternalPaymentResult {
  resolution: PaymentResolution;
  payments: ExternalPaymentFact[];
}
export interface StripeReader {
  get(path: string, query?: Record<string, string>): Promise<Obj>;
  list(
    path: string,
    query?: Record<string, string>,
    maximum?: number,
  ): Promise<Obj[]>;
}
function amount(value: unknown, positive = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 9_000_000_000_000
  )
    throw new ExternalPaymentError("invalid_provider_amount");
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z]{3}$/.test(value))
    throw new ExternalPaymentError("invalid_provider_currency");
  return value.toUpperCase();
}
function timestamp(value: unknown): string {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 946684800 ||
    value * 1000 > Date.now() + 300000
  )
    throw new ExternalPaymentError("invalid_provider_time");
  return new Date(value * 1000).toISOString();
}
function checkMode(obj: Obj, config: ExternalPaymentConfig): void {
  if (obj.livemode !== (config.mode === "live"))
    throw new ExternalPaymentError("wrong_payment_mode", 400);
}
export function validateExternalEvent(
  event: Obj,
  config: ExternalPaymentConfig,
): void {
  paymentId(event.id, "evt");
  checkMode(event, config);
  if (
    config.scope === "connected"
      ? event.account !== config.accountId
      : event.account != null
  )
    throw new ExternalPaymentError("wrong_payment_account", 400);
  if (event.context != null)
    throw new ExternalPaymentError("organization_events_unsupported", 400);
  timestamp(event.created);
}
/** Require every line to map to one destination; never credit an entire mixed basket. */
function mappedLines(
  lines: Obj[],
  config: ExternalPaymentConfig,
  invoice: boolean,
): { destination: string; prices: string[] } | null {
  if (!lines.length) return null;
  const mapped = lines.map((line) => {
    const details = invoice
      ? paymentObject(paymentObject(line.pricing).price_details)
      : paymentObject(line.price);
    if (invoice && paymentObject(line.pricing).type !== "price_details")
      throw new ExternalPaymentError("unsupported_invoice_pricing");
    const price = paymentId(invoice ? details.price : details.id, "price"),
      product = paymentId(details.product, "prod");
    return config.prices.find(
      (entry) => entry.price_id === price && entry.product_id === product,
    );
  });
  if (mapped.every((row) => !row)) return null;
  if (
    mapped.some((row) => !row) ||
    new Set(mapped.map((row) => row?.destination)).size !== 1
  )
    throw new ExternalPaymentError("mixed_or_unmapped_basket");
  return {
    destination: mapped[0]!.destination,
    prices: [...new Set(mapped.map((row) => row!.price_id))].sort(),
  };
}
async function intentFact(
  reader: StripeReader,
  intentId: string,
  mapping: { destination: string; prices: string[] },
  config: ExternalPaymentConfig,
  acquireRefresh: AcquirePaymentRefresh,
): Promise<ExternalPaymentFact | null> {
  // The lease must precede ALL mutable canonical payment/refund reads. SQL
  // rejects an expired/replaced fence before applying even a valid snapshot.
  const refreshFence = await acquireRefresh(paymentId(intentId, "pi"));
  const intent = await reader.get(
    `/payment_intents/${paymentId(intentId, "pi")}`,
  );
  if (intent.id !== intentId)
    throw new ExternalPaymentError("payment_identity_mismatch");
  checkMode(intent, config);
  if (intent.status !== "succeeded") return null;
  if (paymentObject(intent.metadata ?? {}).integration === "site-offers")
    throw new ExternalPaymentError("native_payment_excluded");
  const chargeId = paymentId(intent.latest_charge, "ch"),
    charge = await reader.get(`/charges/${chargeId}`);
  if (charge.id !== chargeId)
    throw new ExternalPaymentError("payment_identity_mismatch");
  checkMode(charge, config);
  if (
    paymentId(charge.payment_intent, "pi") !== intentId ||
    charge.paid !== true ||
    charge.captured !== true ||
    charge.status !== "succeeded"
  )
    throw new ExternalPaymentError("payment_not_captured");
  const gross = amount(charge.amount_captured, true);
  if (
    gross !== amount(intent.amount_received, true) ||
    currency(charge.currency) !== currency(intent.currency)
  )
    throw new ExternalPaymentError("multiple_or_partial_capture_unsupported");
  const refunds = await reader.list("/refunds", { charge: chargeId }, 100);
  let refunded = 0;
  for (const refund of refunds) {
    if (
      paymentId(refund.charge, "ch") !== chargeId ||
      currency(refund.currency) !== currency(charge.currency)
    )
      throw new ExternalPaymentError("refund_mismatch");
    if (refund.status === "succeeded") refunded += amount(refund.amount, true);
  }
  if (!Number.isSafeInteger(refunded) || refunded > gross)
    throw new ExternalPaymentError("invalid_refund_total");
  return {
    payment_id: intentId,
    charge_id: chargeId,
    destination: mapping.destination,
    amount_minor: gross,
    refunded_minor: refunded,
    currency: currency(charge.currency),
    occurred_at: timestamp(charge.created),
    price_ids: mapping.prices,
    refresh_fence: refreshFence,
  };
}
async function fromInvoice(
  reader: StripeReader,
  invoiceId: string,
  config: ExternalPaymentConfig,
  acquireRefresh: AcquirePaymentRefresh,
  onlyIntent?: string,
): Promise<ExternalPaymentResult> {
  const invoice = await reader.get(`/invoices/${paymentId(invoiceId, "in")}`);
  if (invoice.id !== invoiceId)
    throw new ExternalPaymentError("payment_identity_mismatch");
  checkMode(invoice, config);
  const lines = await reader.list(`/invoices/${invoiceId}/lines`, {}, 100);
  const mapping = mappedLines(lines, config, true);
  if (!mapping) return { resolution: "unmapped", payments: [] };
  if (invoice.status !== "paid" || amount(invoice.amount_paid) === 0)
    return { resolution: "not_paid", payments: [] };
  const invoicePayments = await reader.list(
    "/invoice_payments",
    { invoice: invoiceId, status: "paid" },
    20,
  );
  const payments: ExternalPaymentFact[] = [];
  // Acquire multi-payment leases in a consistent order so overlapping invoice
  // callbacks cannot each hold the other's next payment until their expiry.
  const orderedPayments = [...invoicePayments].sort((a, b) => {
    const first = String(paymentObject(a.payment).payment_intent ?? "");
    const second = String(paymentObject(b.payment).payment_intent ?? "");
    return first < second ? -1 : first > second ? 1 : 0;
  });
  for (const row of orderedPayments) {
    checkMode(row, config);
    if (row.status !== "paid" || paymentId(row.invoice, "in") !== invoiceId)
      throw new ExternalPaymentError("invoice_payment_mismatch");
    const payment = paymentObject(row.payment);
    if (payment.type !== "payment_intent")
      throw new ExternalPaymentError("out_of_band_payment_unsupported");
    const id = paymentId(payment.payment_intent, "pi");
    if (onlyIntent && id !== onlyIntent) continue;
    const fact = await intentFact(reader, id, mapping, config, acquireRefresh);
    if (
      !fact ||
      fact.amount_minor !== amount(row.amount_paid, true) ||
      fact.currency !== currency(row.currency) ||
      fact.currency !== currency(invoice.currency)
    )
      throw new ExternalPaymentError("allocated_payment_unsupported");
    // A PaymentIntent can pay several invoices. Such allocations need a separate accounting model.
    const allocations = await reader.list(
      "/invoice_payments",
      {
        "payment[type]": "payment_intent",
        "payment[payment_intent]": id,
        status: "paid",
      },
      20,
    );
    if (
      allocations.length !== 1 ||
      paymentId(allocations[0].invoice, "in") !== invoiceId
    )
      throw new ExternalPaymentError("allocated_payment_unsupported");
    payments.push(fact);
  }
  if (!payments.length)
    throw new ExternalPaymentError("invoice_payment_unresolved");
  return { resolution: "applied", payments };
}
async function fromCheckout(
  reader: StripeReader,
  sessionId: string,
  config: ExternalPaymentConfig,
  acquireRefresh: AcquirePaymentRefresh,
): Promise<ExternalPaymentResult> {
  const session = await reader.get(
    `/checkout/sessions/${paymentId(sessionId, "cs")}`,
  );
  if (session.id !== sessionId)
    throw new ExternalPaymentError("payment_identity_mismatch");
  checkMode(session, config);
  if (paymentObject(session.metadata ?? {}).integration === "site-offers")
    return { resolution: "unmapped", payments: [] };
  // Subscription payments are reconciled from invoices, never counted again as sessions.
  if (session.mode !== "payment")
    return { resolution: "unsupported", payments: [] };
  const lines = await reader.list(
      `/checkout/sessions/${sessionId}/line_items`,
      {},
      100,
    ),
    mapping = mappedLines(lines, config, false);
  if (!mapping) return { resolution: "unmapped", payments: [] };
  if (
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    amount(session.amount_total) === 0
  )
    return { resolution: "not_paid", payments: [] };
  // Invoice-generating one-time Checkout is owned by invoice reconciliation too.
  if (session.invoice)
    return fromInvoice(
      reader,
      paymentId(session.invoice, "in"),
      config,
      acquireRefresh,
    );
  const fact = await intentFact(
    reader,
    paymentId(session.payment_intent, "pi"),
    mapping,
    config,
    acquireRefresh,
  );
  if (
    !fact ||
    fact.amount_minor !== amount(session.amount_total, true) ||
    fact.currency !== currency(session.currency)
  )
    throw new ExternalPaymentError("checkout_payment_mismatch");
  return { resolution: "applied", payments: [fact] };
}
export async function reconcileExternalEvent(
  event: Obj,
  reader: StripeReader,
  config: ExternalPaymentConfig,
  acquireRefresh: AcquirePaymentRefresh,
): Promise<ExternalPaymentResult> {
  validateExternalEvent(event, config);
  const object = paymentObject(paymentObject(event.data).object);
  if (event.type === "invoice.payment_succeeded")
    return fromInvoice(
      reader,
      paymentId(object.id, "in"),
      config,
      acquireRefresh,
    );
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  )
    return fromCheckout(
      reader,
      paymentId(object.id, "cs"),
      config,
      acquireRefresh,
    );
  if (
    ![
      "charge.refunded",
      "refund.created",
      "refund.updated",
      "refund.failed",
    ].includes(String(event.type))
  )
    return { resolution: "unsupported", payments: [] };
  const chargeId =
    event.type === "charge.refunded"
      ? paymentId(object.id, "ch")
      : paymentId(object.charge, "ch");
  const charge = await reader.get(`/charges/${chargeId}`);
  if (charge.id !== chargeId)
    throw new ExternalPaymentError("payment_identity_mismatch");
  checkMode(charge, config);
  if (!charge.payment_intent)
    return { resolution: "unsupported", payments: [] };
  const intentId = paymentId(charge.payment_intent, "pi");
  const allocations = await reader.list(
    "/invoice_payments",
    {
      "payment[type]": "payment_intent",
      "payment[payment_intent]": intentId,
      status: "paid",
    },
    20,
  );
  if (allocations.length > 1)
    throw new ExternalPaymentError("allocated_payment_unsupported");
  if (allocations.length === 1)
    return fromInvoice(
      reader,
      paymentId(allocations[0].invoice, "in"),
      config,
      acquireRefresh,
      intentId,
    );
  const sessions = await reader.list(
    "/checkout/sessions",
    { payment_intent: intentId },
    20,
  );
  if (sessions.length > 1) throw new ExternalPaymentError("ambiguous_checkout");
  if (!sessions.length) return { resolution: "unmapped", payments: [] };
  const result = await fromCheckout(
    reader,
    paymentId(sessions[0].id, "cs"),
    config,
    acquireRefresh,
  );
  if (result.payments.some((payment) => payment.charge_id !== chargeId))
    throw new ExternalPaymentError("charge_mismatch");
  return result;
}

/** Fixed Stripe origin, GET only, bounded deadline/calls/pages/bytes. No provider URLs are followed. */
export function externalStripeReader(
  config: ExternalPaymentConfig,
  request: typeof fetch = fetch,
): StripeReader {
  const deadline = Date.now() + 25000;
  let calls = 0;
  const get: StripeReader["get"] = async (path, query = {}) => {
    if (
      !/^\/[a-z_]+(?:\/[A-Za-z0-9_]+){0,3}$/.test(path) ||
      ++calls > 32 ||
      Date.now() >= deadline
    )
      throw new ExternalPaymentError("provider_read_limit");
    const url = new URL("https://api.stripe.com/v1" + path);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        Math.min(8000, deadline - Date.now()),
      );
    try {
      const response = await request(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.secret}`,
          "Stripe-Version": EXTERNAL_STRIPE_API_VERSION,
          ...(config.scope === "connected"
            ? { "Stripe-Account": config.accountId }
            : {}),
        },
      });
      if (!response.ok) throw new ExternalPaymentError("provider_read_failed");
      return paymentObject(JSON.parse(await readExternalBody(response)));
    } catch (error) {
      if (error instanceof ExternalPaymentError) throw error;
      throw new ExternalPaymentError("provider_read_failed");
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    get,
    list: async (path, query = {}, maximum = 100) => {
      const rows: Obj[] = [],
        seen = new Set<string>();
      let after = "";
      for (let page = 0; page < 5; page++) {
        const response = await get(path, {
          ...query,
          limit: String(Math.min(100, maximum)),
          ...(after ? { starting_after: after } : {}),
        });
        if (
          !Array.isArray(response.data) ||
          typeof response.has_more !== "boolean"
        )
          throw new ExternalPaymentError("invalid_provider_page");
        for (const value of response.data) {
          const row = paymentObject(value);
          if (
            typeof row.id !== "string" ||
            !ID.test(row.id) ||
            seen.has(row.id)
          )
            throw new ExternalPaymentError("invalid_provider_page");
          seen.add(row.id);
          rows.push(row);
        }
        if (rows.length > maximum)
          throw new ExternalPaymentError("provider_page_limit");
        if (!response.has_more) return rows;
        if (!response.data.length || rows.length >= maximum)
          throw new ExternalPaymentError("provider_page_limit");
        after = String(rows[rows.length - 1].id);
      }
      throw new ExternalPaymentError("provider_page_limit");
    },
  };
}
export async function readExternalBody(
  body: { body: ReadableStream<Uint8Array> | null },
  maximum = 1048576,
): Promise<string> {
  if (!body.body) throw new ExternalPaymentError("missing_body", 400);
  const reader = body.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new ExternalPaymentError("body_too_large", 413);
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
    throw new ExternalPaymentError("invalid_body", 400);
  }
}
