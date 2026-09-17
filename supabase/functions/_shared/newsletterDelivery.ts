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
  ): Promise<void>;
  send(payload: unknown, key: string): Promise<Response>;
}
export const TOKEN_PLACEHOLDER = "NEWSLETTER_RECIPIENT_TOKEN";

/** Never retry an uncertain provider call: the persisted attempt needs review. */
export async function deliverNewsletter(
  sendId: string,
  port: DeliveryPort,
): Promise<{ sent: number; state: "sent" | "needs_review" }> {
  let sent = 0;
  for (;;) {
    const batch = await port.nextBatch();
    if (!batch) return { sent, state: "sent" };
    const payload = batch.recipients.map((r) => ({
      ...batch.template,
      to: [r.email],
      html: batch.template.html.replaceAll(
        TOKEN_PLACEHOLDER,
        encodeURIComponent(r.confirm_token),
      ),
    }));
    let response: Response;
    try {
      response = await port.send(payload, `nl-${sendId}-${batch.attempt_id}`);
    } catch {
      await port.record(
        batch,
        "uncertain",
        [],
        "Provider request interrupted; check provider before taking further action.",
      );
      return { sent, state: "needs_review" };
    }
    if (!response.ok) {
      await port.record(
        batch,
        response.status >= 500 ? "uncertain" : "failed",
        [],
        `Provider returned HTTP ${response.status}`,
      );
      return { sent, state: "needs_review" };
    }
    let ids: string[] = [];
    try {
      const result = (await response.json()) as {
        data?: Array<{ id?: unknown }>;
      };
      ids = (result.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === "string" && !!id);
    } catch {
      /* An accepted response without parseable receipts is uncertain. */
    }
    if (ids.length !== batch.recipients.length) {
      await port.record(
        batch,
        "uncertain",
        [],
        "Provider accepted the request but receipts were incomplete.",
      );
      return { sent, state: "needs_review" };
    }
    // If this database write fails, the durable 'attempting' rows prevent replay.
    await port.record(batch, "accepted", ids);
    sent += ids.length;
  }
}
