import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "./withTimeout";
import {
  parseCallConfig,
  type CallAnswers,
  type CallApplicationState,
  type CallContact,
  type CallFunnelConfig,
  type CallFunnelDraft,
  type CallOutcomeKind,
  type CallPublication,
} from "./callFunnels";
type CallDatabase = {
  public: {
    Tables: {
      call_funnels: {
        Row: CallFunnelDraft;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      call_funnel_save: {
        Args: Record<string, unknown>;
        Returns: CallFunnelDraft;
      };
      call_funnel_admin_report: {
        Args: { _funnel_id: string; _limit?: number; _offset?: number };
        Returns: CallFunnelReport;
      };
      call_funnel_admin_event: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
// Keep the new contracts isolated until Lovable regenerates database types.
const database = supabase as unknown as SupabaseClient<CallDatabase>;
export type CallSave = {
  id: string;
  slug: string;
  title: string;
  config: CallFunnelConfig;
  expectedVersion: number;
  publish: boolean;
  active: boolean;
  requestId: string;
};
export type CallReportApplication = {
  id: string;
  contact: CallContact;
  answers: CallAnswers;
  questions?: {
    id: string;
    label: string;
    options?: { id: string; label: string }[];
  }[];
  outcome: string;
  submittedAt: string;
  revision: number;
  booking?: { status: string; startsAt: string | null; source: string | null };
  attendance?: { status: string; source: string | null };
  sale?: { status: string; source: string | null };
  events?: {
    id: string;
    type: string;
    source: string;
    occurredAt: string;
    reference: string;
    note: string;
  }[];
};
export type CallFunnelReport = {
  applications: CallReportApplication[];
  counts: Record<string, number>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  retentionDays: number;
  generatedAt: string;
};
export type CallSubmit = {
  slug: string;
  revision: number;
  token: string;
  requestId: string;
  answers: CallAnswers;
  contact: CallContact;
  consent: true;
};
/** A server rejection rolls back the RPC; a transport failure may have committed. */
export class CallMutationError extends Error {
  constructor(
    message: string,
    public code: string,
    public rejected: boolean,
  ) {
    super(message);
    this.name = "CallMutationError";
  }
}
export function isCallMutationRejected(error: unknown): boolean {
  return error instanceof CallMutationError && error.rejected;
}
function mutationFailure(
  error: { code?: string; message?: string },
  kind: "save" | "outcome",
) {
  const code = error.code ?? "";
  const rejected =
    /^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501|28000|PGRST(?:1\d\d|20\d|30\d))$/.test(
      code,
    );
  let message =
    kind === "save"
      ? "This save could not be confirmed. Retry the same save to confirm its result."
      : "The outcome could not be confirmed. Retry the same outcome to confirm its result.";
  if (rejected) {
    const detail = error.message ?? "";
    if (kind === "save" && code === "23505")
      message =
        "That page address is already in use. Choose a different address and save your draft again.";
    else if (/conflict/i.test(detail))
      message =
        "Another administrator saved this funnel. Your edits are still here. Reload the saved version before saving again.";
    else if (
      /admins only|permission|jwt/i.test(detail) ||
      ["42501", "28000"].includes(code)
    )
      message =
        "This update was rejected. Check your administrator access and try again.";
    else if (
      kind === "outcome" &&
      /active booking before attendance/i.test(detail)
    )
      message =
        "Record an active booking before recording attendance. Your outcome was not saved.";
    else if (kind === "outcome" && /not qualified for booking/i.test(detail))
      message =
        "This application is on the alternative path. Only a sale can be recorded for it.";
    else if (/replay mismatch/i.test(detail))
      message =
        "The server rejected this request because its saved details differ. Reload the latest information before trying a corrected update.";
    else
      message =
        kind === "save"
          ? "The server rejected this draft. Check the fields and approved proof, then save again. Your edits are still here."
          : "The server rejected this outcome. Check the selected outcome, appointment time and reference, then try again. Your entry is still here.";
  }
  return new CallMutationError(message, code, rejected);
}
export async function listCallFunnels(): Promise<CallFunnelDraft[]> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      database
        .from("call_funnels")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100)
        .abortSignal(AbortSignal.timeout(15000)),
    ),
  );
  if (error)
    throw new Error(
      "Call funnels could not be loaded. Check your administrator access and try again.",
    );
  return (data ?? []).map((row) => ({
    ...row,
    draft_config: parseCallConfig(row.draft_config),
  }));
}
export async function saveCallFunnel(
  input: CallSave,
): Promise<CallFunnelDraft> {
  try {
    parseCallConfig(input.config, input.publish);
  } catch (error) {
    throw new CallMutationError(
      error instanceof Error ? error.message : "Check your draft fields.",
      "client_validation",
      true,
    );
  }
  const { data, error } = await withTimeout(
    Promise.resolve(
      database.rpc("call_funnel_save", {
        _id: input.id,
        _slug: input.slug,
        _title: input.title.trim(),
        _config: input.config,
        _expected_version: input.expectedVersion,
        _publish: input.publish,
        _active: input.active,
        _request_id: input.requestId,
      }),
    ),
  );
  if (error) throw mutationFailure(error, "save");
  return { ...data, draft_config: parseCallConfig(data.draft_config) };
}
export async function loadCallReport(
  id: string,
  offset = 0,
): Promise<CallFunnelReport> {
  const { data, error } = await withTimeout(
    Promise.resolve(
      database
        .rpc("call_funnel_admin_report", {
          _funnel_id: id,
          _limit: 50,
          _offset: offset,
        })
        .abortSignal(AbortSignal.timeout(15000)),
    ),
  );
  if (error)
    throw new Error("Applications could not be loaded. Please try again.");
  return data;
}
export type CallAdminEvent = {
  applicationId: string;
  requestId: string;
  type: CallOutcomeKind;
  occurredAt: string;
  startsAt: string | null;
  reference: string;
  note: string;
};
export async function saveCallOutcome(e: CallAdminEvent): Promise<void> {
  const { error } = await withTimeout(
    Promise.resolve(
      database.rpc("call_funnel_admin_event", {
        _application_id: e.applicationId,
        _request_id: e.requestId,
        _type: e.type,
        _occurred_at: e.occurredAt,
        _starts_at: e.startsAt,
        _reference: e.reference,
        _note: e.note,
      }),
    ),
  );
  if (error) throw mutationFailure(error, "outcome");
}
async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("call-funnel-api", { body }),
    15000,
  );
  if (error) {
    let message = "This request could not be confirmed. Please retry.";
    if (error.context instanceof Response)
      try {
        const detail = await withTimeout(error.context.json(), 2000);
        if (
          detail &&
          typeof detail === "object" &&
          "error" in detail &&
          typeof detail.error === "string"
        )
          message = detail.error;
      } catch {
        /* preserve safe fallback */
      }
    throw new CallApiError(
      message,
      error.context instanceof Response ? error.context.status : 0,
    );
  }
  return data as T;
}
export class CallApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "CallApiError";
  }
}
export async function getCallPublication(
  slug: string,
): Promise<CallPublication | null> {
  try {
    return await callApi<CallPublication | null>({ action: "get", slug });
  } catch (error) {
    if (error instanceof CallApiError && error.status === 404) return null;
    throw error;
  }
}
export const submitCallApplication = (input: CallSubmit) =>
  callApi<CallApplicationState>({ action: "submit", ...input });
export const getCallApplicationState = (token: string) =>
  callApi<CallApplicationState>({ action: "state", token });
