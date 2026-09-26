import {
  EXTERNAL_PAYMENT_EVENTS,
  EXTERNAL_STRIPE_API_VERSION,
  ExternalPaymentError,
  externalPaymentConfig,
  externalStripeReader,
  paymentObject,
  readExternalBody,
  reconcileExternalEvent,
  validateExternalEvent,
  type ExternalPaymentConfig,
  type StripeReader,
} from "./externalPayments.ts";
type Obj = Record<string, unknown>;
export interface ExternalPaymentStore {
  status(identity: Obj): Promise<Obj>;
  apply(event: Obj, payments: unknown[]): Promise<Obj>;
  acquireRefresh(identity: Obj): Promise<Obj>;
  releaseRefresh(identity: Obj): Promise<void>;
}
export interface ExternalPaymentDependencies {
  env(name: string): string | undefined;
  authorizeAdmin(request: Request): Promise<void>;
  verify(
    body: string,
    signature: string,
    config: ExternalPaymentConfig,
  ): Promise<unknown>;
  store(): ExternalPaymentStore;
  reader?(config: ExternalPaymentConfig): StripeReader;
}
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
/** Event data/identity are immutable; pending_webhooks is delivery bookkeeping. */
function eventIdentity(event: Obj): string {
  // Endpoints may render data with a different Stripe API version than Events API.
  // Match the signed object's identity, then reconcile through canonical retrieval.
  return JSON.stringify([
    event.id,
    event.type,
    event.created,
    event.livemode,
    event.account ?? null,
    event.context ?? null,
    paymentObject(paymentObject(event.data).object).id,
  ]);
}
export async function externalPaymentEventHash(event: Obj): Promise<string> {
  const envelope = Object.fromEntries(
    [
      "id",
      "object",
      "type",
      "created",
      "livemode",
      "account",
      "context",
      "api_version",
      "data",
    ].map((key) => [key, event[key] ?? null]),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(stable(envelope))),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function createExternalPaymentHandler(
  deps: ExternalPaymentDependencies,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return json(405, { error: "method_not_allowed" });
    let releaseRefreshes: () => Promise<void> = async () => {};
    try {
      if (new URL(req.url).searchParams.get("action") === "status") {
        await deps.authorizeAdmin(req);
        try {
          const config = externalPaymentConfig(deps.env);
          return json(200, {
            configured: true,
            enabled: config.enabled,
            mode: config.mode,
            scope: config.scope,
            mapped_prices: config.prices.length,
            api_version: EXTERNAL_STRIPE_API_VERSION,
            destinations: [
              ...new Set(config.prices.map((row) => row.destination)),
            ],
            coverage_verified: false,
          });
        } catch {
          return json(200, {
            configured: false,
            enabled: false,
            mode: null,
            scope: null,
            mapped_prices: 0,
            api_version: EXTERNAL_STRIPE_API_VERSION,
            destinations: [],
            coverage_verified: false,
          });
        }
      }
      const config = externalPaymentConfig(deps.env);
      if (!config.enabled)
        throw new ExternalPaymentError("external_payment_intake_disabled");
      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new ExternalPaymentError("invalid_signature", 400);
      const body = await readExternalBody(req);
      let event: Obj;
      try {
        event = paymentObject(await deps.verify(body, signature, config));
      } catch {
        throw new ExternalPaymentError("invalid_signature", 400);
      }
      validateExternalEvent(event, config);
      if (
        !(EXTERNAL_PAYMENT_EVENTS as readonly string[]).includes(
          String(event.type),
        )
      )
        return json(200, { received: true, ignored: true });
      const hash = await externalPaymentEventHash(event);
      const store = deps.store();
      const leases = new Map<string, string>();
      const refreshIdentity = (paymentId: string) => ({
        _provider: "stripe",
        _account_id: config.accountId,
        _mode: config.mode,
        _payment_id: paymentId,
      });
      // Completion releases in SQL. This also clears leases on provider/DB
      // failures; failed releases are safely bounded by the 60-second expiry.
      releaseRefreshes = async () => {
        await Promise.allSettled(
          [...leases].map(([id, fence]) =>
            store.releaseRefresh({ ...refreshIdentity(id), _fence: fence }),
          ),
        );
      };
      const previous = await store.status({
        _provider: "stripe",
        _account_id: config.accountId,
        _mode: config.mode,
        _event_id: event.id,
        _payload_hash: hash,
      });
      if (previous.status === "conflict")
        throw new ExternalPaymentError("event_identity_conflict", 409);
      if (previous.status === "processed")
        return json(200, { received: true, duplicate: true });
      if (previous.status !== "missing")
        throw new ExternalPaymentError("receipt_unavailable");
      const reader = deps.reader?.(config) ?? externalStripeReader(config);
      const account = await reader.get("/account");
      if (account.id !== config.accountId)
        throw new ExternalPaymentError("wrong_payment_account", 400);
      const canonicalEvent = await reader.get(`/events/${event.id}`);
      validateExternalEvent(canonicalEvent, config);
      if (eventIdentity(canonicalEvent) !== eventIdentity(event))
        throw new ExternalPaymentError("event_identity_conflict", 409);
      const result = await reconcileExternalEvent(
        canonicalEvent,
        reader,
        config,
        async (id) => {
          const existing = leases.get(id);
          if (existing) return existing;
          const result = await store.acquireRefresh(refreshIdentity(id));
          if (result.status === "busy")
            throw new ExternalPaymentError("payment_refresh_busy");
          if (
            result.status !== "acquired" ||
            typeof result.fence !== "string" ||
            !/^[1-9][0-9]{0,18}$/.test(result.fence)
          )
            throw new ExternalPaymentError("payment_refresh_unavailable");
          leases.set(id, result.fence);
          return result.fence;
        },
      );
      const applied = await store.apply(
        {
          provider: "stripe",
          account_id: config.accountId,
          mode: config.mode,
          event_id: event.id,
          payload_hash: hash,
          event_type: event.type,
          resolution: result.resolution,
          provider_created_at: new Date(
            Number(event.created) * 1000,
          ).toISOString(),
          observed_at: new Date().toISOString(),
        },
        result.payments,
      );
      if (applied.status !== "processed" && applied.status !== "duplicate")
        throw new ExternalPaymentError("reconciliation_unavailable");
      return json(200, {
        received: true,
        duplicate: applied.status === "duplicate",
        resolution: result.resolution,
      });
    } catch (error) {
      if (error instanceof ExternalPaymentError)
        return json(error.status, { error: error.code });
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 503;
      return json(status === 401 || status === 403 ? status : 503, {
        error: "external_payment_request_failed",
      });
    } finally {
      await releaseRefreshes();
    }
  };
}
