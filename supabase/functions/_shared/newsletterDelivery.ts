export interface DeliveryBatch {
  attempt_id: string;
  template: { from: string; reply_to: string; subject: string; html: string };
  recipients: Array<{ id: string; email: string; confirm_token: string }>;
}
export interface DeliveryPort {
  nextBatch(): Promise<DeliveryBatch | null>;
  record(
    batch: DeliveryBatch,
    outcome: "accepted" | "failed" | "uncertain",
    ids: string[],
    detail?: string,
    providerStatus?: number | null,
  ): Promise<void>;
  send(payload: unknown, key: string): Promise<Response>;
  /** Public unsubscribe endpoint; enables RFC 2369/8058 List-Unsubscribe headers. */
  unsubscribeUrl?: string;
}
export const TOKEN_PLACEHOLDER = "NEWSLETTER_RECIPIENT_TOKEN";

/** Per-recipient List-Unsubscribe headers (one-click POST, RFC 8058). */
export function listUnsubscribeHeaders(
  unsubscribeUrl: string,
  token: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}?token=${encodeURIComponent(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface DeliveryFailure {
  outcome: "failed" | "uncertain";
  providerStatus: number | null;
  detail: string;
}
/**
 * "completed" means no deliveries are left to attempt; the database decides
 * whether that is 'sent' or 'failed'. "stopped" means a batch was rejected or
 * uncertain and the send is now 'failed' or 'needs_review'.
 */
export interface DeliveryResult {
  sent: number;
  state: "completed" | "stopped";
  failure?: DeliveryFailure;
}

export const PROVIDER_MESSAGE_LIMIT = 300;

function providerMessage(body: string): string {
  const text = body.trim();
  if (!text) return "";
  let message = text;
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      error?: unknown;
    } | null;
    const nested =
      parsed && typeof parsed.error === "object" && parsed.error
        ? (parsed.error as { message?: unknown }).message
        : undefined;
    const candidate = [parsed?.message, parsed?.error, nested].find(
      (value): value is string => typeof value === "string" && !!value.trim(),
    );
    if (candidate) message = candidate;
  } catch {
    /* Not JSON: keep the raw text. */
  }
  return message.replace(/\s+/g, " ").trim().slice(0, PROVIDER_MESSAGE_LIMIT);
}

/** "Provider returned HTTP 403: <provider message>", bounded for storage. */
export function providerErrorDetail(status: number, body: string): string {
  const message = providerMessage(body);
  return message
    ? `Provider returned HTTP ${status}: ${message}`
    : `Provider returned HTTP ${status}`;
}

async function readBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 4096);
  } catch {
    return "";
  }
}

function recipientPayload(batch: DeliveryBatch, unsubscribeUrl?: string) {
  return batch.recipients.map((r) => ({
    ...batch.template,
    to: [r.email],
    html: batch.template.html.replaceAll(
      TOKEN_PLACEHOLDER,
      encodeURIComponent(r.confirm_token),
    ),
    ...(unsubscribeUrl
      ? { headers: listUnsubscribeHeaders(unsubscribeUrl, r.confirm_token) }
      : {}),
  }));
}

async function receiptIds(response: Response): Promise<string[]> {
  try {
    const result = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    return (result.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && !!id);
  } catch {
    /* An accepted response without parseable receipts is uncertain. */
    return [];
  }
}

/** Never retry an uncertain provider call: the persisted attempt needs review. */
export async function deliverNewsletter(
  sendId: string,
  port: DeliveryPort,
): Promise<DeliveryResult> {
  let sent = 0;
  const stop = async (
    batch: DeliveryBatch,
    failure: DeliveryFailure,
  ): Promise<DeliveryResult> => {
    await port.record(
      batch,
      failure.outcome,
      [],
      failure.detail,
      failure.providerStatus,
    );
    return { sent, state: "stopped", failure };
  };
  for (;;) {
    const batch = await port.nextBatch();
    if (!batch) return { sent, state: "completed" };
    let response: Response;
    try {
      response = await port.send(
        recipientPayload(batch, port.unsubscribeUrl),
        `nl-${sendId}-${batch.attempt_id}`,
      );
    } catch {
      return stop(batch, {
        outcome: "uncertain",
        providerStatus: null,
        detail:
          "Provider request interrupted; check provider before taking further action.",
      });
    }
    if (!response.ok) {
      // 4xx is a definite rejection; 5xx may still have been delivered.
      return stop(batch, {
        outcome: response.status >= 500 ? "uncertain" : "failed",
        providerStatus: response.status,
        detail: providerErrorDetail(response.status, await readBody(response)),
      });
    }
    const ids = await receiptIds(response);
    if (ids.length !== batch.recipients.length) {
      return stop(batch, {
        outcome: "uncertain",
        providerStatus: null,
        detail: "Provider accepted the request but receipts were incomplete.",
      });
    }
    // If this database write fails, the durable 'attempting' rows prevent replay.
    await port.record(batch, "accepted", ids);
    sent += ids.length;
  }
}

export interface StoredSendOutcome {
  status: string;
  sent_count: number | null;
  recipient_count: number | null;
  last_error?: string | null;
  last_error_status?: number | null;
}

/**
 * HTTP response for a send, derived only from the stored row (the database
 * decides 'sent' vs 'failed' vs 'needs_review'). Only 'sent' is ok.
 */
export function sendOutcomeResponse(row: StoredSendOutcome): {
  httpStatus: number;
  body: {
    ok: boolean;
    state: string;
    sent: number;
    recipients: number;
    last_error: string | null;
    last_error_status: number | null;
  };
} {
  const httpStatus =
    row.status === "sent" || row.status === "cancelled"
      ? 200
      : row.status === "sending" || row.status === "preview"
        ? 202
        : 502;
  return {
    httpStatus,
    body: {
      ok: row.status === "sent",
      state: row.status,
      sent: row.sent_count ?? 0,
      recipients: row.recipient_count ?? 0,
      last_error: row.last_error ?? null,
      last_error_status: row.last_error_status ?? null,
    },
  };
}
