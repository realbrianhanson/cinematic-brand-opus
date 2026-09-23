// Admin "resend confirmation to pending" run. Dependency-free so it can be unit
// tested; index.ts supplies the database and provider port.

export interface PendingRow {
  email: string;
  confirm_token: string;
  last_confirmation_sent_at: string | null;
  confirmation_send_count: number;
}

export type SendOutcome =
  { ok: true } | { ok: false; status: number | null; detail: string };

export interface ResendPort {
  listPending(limit: number): Promise<PendingRow[]>;
  countPending(): Promise<number>;
  /** Optimistic claim on last_confirmation_sent_at; false if another run won. */
  claim(row: PendingRow, claimIso: string): Promise<boolean>;
  /** Undo a claim after a failed send so the admin can retry right away. */
  release(row: PendingRow, claimIso: string): Promise<void>;
  confirmSent(row: PendingRow, claimIso: string): Promise<void>;
  send(row: PendingRow, idempotencyKey: string): Promise<SendOutcome>;
  now(): Date;
}

export interface ResendPendingResult {
  ok: boolean;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  error: string | null;
  provider_status: number | null;
}

export const RESEND_BATCH_LIMIT = 50;
export const RESEND_COOLDOWN_SECONDS = 15 * 60;

/** A rejection that will repeat for every recipient (sender/key problem). */
const isAccountRejection = (status: number | null) =>
  status === 401 || status === 403;

export async function resendPendingConfirmations(
  port: ResendPort,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
): Promise<ResendPendingResult> {
  const rows = await port.listPending(RESEND_BATCH_LIMIT);
  const pending = Math.max(await port.countPending(), rows.length);
  const result: ResendPendingResult = {
    ok: true,
    pending,
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    error: null,
    provider_status: null,
  };
  let processed = 0;
  for (const row of rows) {
    processed++;
    const now = port.now();
    const last = row.last_confirmation_sent_at
      ? Date.parse(row.last_confirmation_sent_at)
      : NaN;
    if (
      Number.isFinite(last) &&
      last > now.getTime() - cooldownSeconds * 1000
    ) {
      result.skipped++;
      continue;
    }
    const claimIso = now.toISOString();
    let claimed: boolean;
    try {
      claimed = await port.claim(row, claimIso);
    } catch (error) {
      result.failed++;
      result.error ??=
        error instanceof Error ? error.message : "Could not claim recipient";
      continue;
    }
    if (!claimed) {
      result.skipped++;
      continue;
    }
    const outcome = await port.send(
      row,
      `nl-confirm-${row.confirm_token}-${claimIso}`,
    );
    if (outcome.ok) {
      await port.confirmSent(row, claimIso);
      result.sent++;
      continue;
    }
    result.failed++;
    result.error ??= outcome.detail;
    result.provider_status ??= outcome.status;
    await port.release(row, claimIso);
    if (isAccountRejection(outcome.status)) break;
  }
  result.remaining = Math.max(0, pending - processed);
  result.ok = result.failed === 0;
  return result;
}
