import {
  conversionHash,
  conversionIdentity,
  conversionRequestAllowed,
} from "./conversion.ts";
type ConversionRpcResult = { data?: unknown; error: unknown };
type ConversionRpcRequest = PromiseLike<ConversionRpcResult> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<ConversionRpcResult>;
};
type ConversionRpcClient = {
  rpc(name: string, args: Record<string, unknown>): ConversionRpcRequest;
};

/** Abort real HTTP requests and also bound adapters that cannot honour cancellation. */
async function boundedMeasurementRpc(
  admin: ConversionRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<ConversionRpcResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ConversionRpcResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ error: new Error("Optional measurement timed out") });
    }, 500);
  });
  try {
    const request = admin.rpc(name, args);
    const operation = request.abortSignal
      ? request.abortSignal(controller.signal)
      : request;
    // Promise.race observes late rejection too; no detached, unhandled failures.
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Accounting never trusts browser outcomes; optional measurement never blocks fulfillment. */
export async function bindOrderMeasurement(
  admin: ConversionRpcClient,
  input: {
    request: Request;
    measurement: unknown;
    origin: string;
    anonKey?: string;
    orderId: string;
    paymentMode: "live" | "test" | "unconfigured";
  },
): Promise<void> {
  try {
    const allowed = conversionRequestAllowed(
      input.request,
      input.origin,
      input.anonKey,
    );
    const identity = allowed ? conversionIdentity(input.measurement) : null;
    const { data, error } = await boundedMeasurementRpc(
      admin,
      "conversion_bind_order",
      {
        _order_id: input.orderId,
        _payment_mode:
          input.paymentMode === "unconfigured" ? "unknown" : input.paymentMode,
        _session_id: identity?.session_id ?? null,
        _token_hash: identity
          ? await conversionHash(identity.session_token)
          : null,
      },
    );
    if (error) {
      console.warn("Optional order measurement unavailable");
      return;
    }
    // Say why a measured visitor got no credit. Never log tokens or IDs.
    // No measurement at all means the visitor declined, which is expected.
    if (data === false && conversionIdentity(input.measurement))
      console.warn("Order measurement not linked", {
        reason: identity ? "session_not_eligible" : "request_excluded",
      });
  } catch {
    console.warn("Optional order measurement unavailable");
  }
}

export async function recordDownloadMeasurement(
  admin: ConversionRpcClient,
  orderId: string,
): Promise<void> {
  try {
    const { error } = await boundedMeasurementRpc(
      admin,
      "conversion_record_download",
      {
        _order_id: orderId,
      },
    );
    if (error) console.warn("Optional download measurement unavailable");
  } catch {
    console.warn("Optional download measurement unavailable");
  }
}

/** Invoke only after signature, mode, order, amount and currency verification. */
export async function recordVerifiedPaymentMode(
  admin: ConversionRpcClient,
  orderId: string,
  mode: "test" | "live",
): Promise<void> {
  try {
    const { error } = await boundedMeasurementRpc(
      admin,
      "conversion_record_payment_mode",
      {
        _order_id: orderId,
        _payment_mode: mode,
      },
    );
    if (error) console.warn("Optional payment mode reporting unavailable");
  } catch {
    console.warn("Optional payment mode reporting unavailable");
  }
}
