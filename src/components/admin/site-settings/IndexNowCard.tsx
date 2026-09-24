import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { indexingOutcome } from "@/lib/adminOutcomes";
import { invokeAdminFunction } from "../manualPublishClient";
import {
  describeIndexNowStatus,
  parseIndexNowStatus,
  type StatusSummary,
} from "./crawlerStatus";

const TONE: Record<StatusSummary["tone"], string> = {
  ok: "hsl(120 60% 40%)",
  warn: "hsl(40 90% 42%)",
  bad: "hsl(0 70% 50%)",
};
const box = {
  padding: "10px 12px",
  borderRadius: 6,
  backgroundColor: "hsl(var(--admin-surface-2))",
  border: "1px solid hsl(var(--admin-border))",
  minWidth: 0,
} as const;
const small = {
  fontSize: 11,
  color: "hsl(var(--admin-text-ghost))",
  lineHeight: 1.5,
} as const;

type KeyFileCheck = {
  key_file_ok: boolean;
  key_file_detail: string | null;
  key_location: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

// admin_indexnow_status() is added in 20260923151000 and not yet in the
// generated Supabase types.
async function readStatus() {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "admin_indexnow_status",
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc("admin_indexnow_status");
  if (error) throw error;
  return parseIndexNowStatus(data);
}

async function checkKeyFile(): Promise<KeyFileCheck> {
  const { status, body } = await invokeAdminFunction("submit-indexnow", {
    status: true,
  });
  if (status !== 200)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : `Setup check failed (HTTP ${status}).`,
    );
  return {
    key_file_ok: body.key_file_ok === true,
    key_file_detail:
      typeof body.key_file_detail === "string" ? body.key_file_detail : null,
    key_location:
      typeof body.key_location === "string" ? body.key_location : null,
  };
}

export function IndexNowCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const status = useQuery({
    queryKey: ["admin-indexnow-status"],
    queryFn: readStatus,
  });
  const keyFile = useQuery({
    queryKey: ["admin-indexnow-keyfile"],
    queryFn: checkKeyFile,
    enabled: !!status.data?.key,
    retry: false,
  });

  const sendNow = async () => {
    setSending(true);
    try {
      const { status: http, body } = await invokeAdminFunction(
        "submit-indexnow",
        { all_unsubmitted: true },
      );
      if (http !== 200)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : `Submission failed (HTTP ${http}).`,
        );
      const outcome = indexingOutcome(
        body as Parameters<typeof indexingOutcome>[0],
      );
      toast({
        ...outcome,
        variant: outcome.failed ? "destructive" : "default",
      });
    } catch (e) {
      toast({
        title: "IndexNow needs attention",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: ["admin-indexnow-status"] });
      qc.invalidateQueries({ queryKey: ["admin-indexnow-keyfile"] });
    }
  };

  const s = status.data;
  const summary = s ? describeIndexNowStatus(s) : null;

  return (
    <section className="admin-card min-w-0" style={{ padding: 24 }}>
      <h2
        className="font-body"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Send
          size={16}
          aria-hidden
          style={{ color: "hsl(var(--admin-accent))" }}
        />
        IndexNow
      </h2>

      {status.isPending && (
        <p className="font-body" style={small}>
          Loading IndexNow status…
        </p>
      )}
      {status.error && (
        <p
          role="alert"
          className="font-body"
          style={{ ...small, color: TONE.bad }}
        >
          Could not load IndexNow status: {errorMessage(status.error)}
        </p>
      )}

      {s && summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={box} role="status">
            <p
              className="font-body"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: TONE[summary.tone],
              }}
            >
              {summary.headline}
            </p>
            {summary.detail && (
              <p className="font-body" style={{ ...small, marginTop: 4 }}>
                {summary.detail}
              </p>
            )}
          </div>

          {s.key && (
            <div style={box}>
              <span className="admin-label" style={{ marginBottom: 4 }}>
                API key
              </span>
              <code
                className="font-body block"
                style={{
                  fontSize: 11,
                  color: "hsl(var(--admin-text-soft))",
                  wordBreak: "break-all",
                  userSelect: "all",
                }}
              >
                {s.key}
              </code>
              <KeyFileLine
                loading={keyFile.isPending}
                error={keyFile.error}
                check={keyFile.data}
              />
            </div>
          )}

          <div className="font-body" style={small}>
            <p>
              {s.receivedTotal} URLs received by IndexNow so far.
              {s.lastSubmissionAt &&
                ` Last run sent ${s.lastSubmissionCount} URLs on ${when(s.lastSubmissionAt)}.`}
            </p>
            {s.lastError && s.lastErrorAt && (
              <p style={{ color: TONE.bad, marginTop: 4 }}>
                Last error ({when(s.lastErrorAt)}): {s.lastError}
              </p>
            )}
          </div>

          <p className="font-body" style={small}>
            IndexNow tells Bing, Yandex, Seznam, Naver and other participating
            engines about new pages. New articles and guides are sent daily at
            08:00 UTC; resources are sent when published. Google reads your
            sitemap instead.
          </p>

          <button
            type="button"
            onClick={sendNow}
            disabled={sending || !s.key}
            className="admin-btn-ghost font-body flex items-center justify-center gap-2 w-full"
            style={{ fontSize: 12, padding: "8px 14px" }}
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Send size={14} aria-hidden />
            )}
            {sending ? "Sending…" : "Send unsent pages now"}
          </button>
        </div>
      )}
    </section>
  );
}

function KeyFileLine({
  loading,
  error,
  check,
}: {
  loading: boolean;
  error: unknown;
  check: KeyFileCheck | undefined;
}) {
  const style = { ...small, marginTop: 6, display: "flex", gap: 6 } as const;
  if (loading)
    return (
      <p className="font-body" style={style}>
        Checking the key file…
      </p>
    );
  if (error || !check)
    return (
      <p className="font-body" style={{ ...style, color: TONE.bad }}>
        Key file check failed: {errorMessage(error)}
      </p>
    );
  return check.key_file_ok ? (
    <p className="font-body" style={{ ...style, color: TONE.ok }}>
      <CheckCircle2 size={13} aria-hidden style={{ flexShrink: 0 }} />
      <span>Key file served</span>
    </p>
  ) : (
    <p className="font-body" style={{ ...style, color: TONE.bad }}>
      <XCircle size={13} aria-hidden style={{ flexShrink: 0 }} />
      <span>{check.key_file_detail ?? "Key file not served."}</span>
    </p>
  );
}
