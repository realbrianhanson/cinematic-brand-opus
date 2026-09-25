import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, MailCheck, RefreshCw, Search, Send } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AUDIENCE_PAGE_SIZE,
  audienceStatuses,
  loadAudience,
  resendPendingConfirmations,
  type AudienceStatus,
  type ResendSummary,
} from "@/lib/newsletterAdmin";
import { explainDeliveryError } from "@/lib/newsletterStatus";
import QueryNotice from "./QueryNotice";

const statusLabels: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Complained",
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

function resendOutcome(result: ResendSummary): {
  tone: "ok" | "error";
  title: string;
  body: string;
} {
  if (result.ok)
    return {
      tone: "ok",
      title: `Sent ${result.sent} confirmation email${result.sent === 1 ? "" : "s"}`,
      body:
        [
          result.skipped
            ? `${result.skipped} skipped (emailed in the last 15 minutes).`
            : "",
          result.remaining
            ? `${result.remaining} more pending; run it again to continue.`
            : "",
        ]
          .filter(Boolean)
          .join(" ") ||
        "Each person gets a link to confirm their subscription.",
    };
  // Only a provider rejection gets the Resend-specific explanation.
  const explained = result.providerStatus
    ? explainDeliveryError({
        status: result.providerStatus,
        detail: result.error,
      })
    : null;
  return {
    tone: "error",
    title: explained?.title ?? "Confirmation emails were not sent",
    body: [
      `${result.sent} sent, ${result.failed} failed.`,
      explained?.explanation ?? result.error ?? "",
      explained?.action?.replace(
        "retry failed recipients",
        "resend confirmations",
      ) ?? "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function CountTile({
  label,
  value,
  help,
}: {
  label: string;
  value: number | undefined;
  help?: string;
}) {
  return (
    <div className="admin-card p-4">
      <p className="admin-help">{label}</p>
      <p className="mt-1 text-2xl font-semibold" aria-live="polite">
        {value ?? "—"}
      </p>
      {help && <p className="admin-help mt-1">{help}</p>}
    </div>
  );
}

export default function AudienceManager() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<AudienceStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [outcome, setOutcome] = useState<ReturnType<
    typeof resendOutcome
  > | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const audience = useQuery({
    queryKey: ["newsletter-audience", filter, term, page],
    queryFn: () => loadAudience({ search: term, status: filter, page }),
  });
  const counts = audience.isError ? undefined : audience.data?.counts;
  const pendingCount = counts?.pending ?? 0;

  const resend = useMutation({
    mutationFn: () => {
      if (
        audience.isPending ||
        audience.isFetching ||
        audience.error ||
        !counts
      )
        throw new Error(
          "Audience details must be available before sending confirmations.",
        );
      return resendPendingConfirmations();
    },
    onSuccess: (result) => setOutcome(resendOutcome(result)),
    onError: (error: Error) =>
      setOutcome({
        tone: "error",
        title: "Confirmation emails were not sent",
        body: error.message,
      }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["newsletter-audience"] });
    },
  });

  const matching = audience.data?.matching ?? 0;
  const pages = Math.max(1, Math.ceil(matching / AUDIENCE_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Business</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Newsletter audience
          </h1>
          <p className="admin-help mt-2">
            Everyone who signed up, whether they confirmed, and where they came
            from.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={audience.isFetching}
            onClick={() => void audience.refetch()}
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            type="button"
            className="admin-btn"
            disabled={
              resend.isPending ||
              audience.isFetching ||
              !counts ||
              pendingCount === 0
            }
            onClick={() => setConfirmOpen(true)}
          >
            <Send size={15} />{" "}
            {resend.isPending
              ? "Sending…"
              : `Resend confirmation to pending${counts ? ` (${pendingCount})` : ""}`}
          </button>
        </div>
      </header>

      <section
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        aria-label="Audience counts"
      >
        <CountTile label="Confirmed" value={counts?.confirmed} />
        <CountTile
          label="Pending"
          value={counts?.pending}
          help={
            counts?.pending_not_emailed
              ? `${counts.pending_not_emailed} never got a confirmation email`
              : undefined
          }
        />
        <CountTile label="Unsubscribed" value={counts?.unsubscribed} />
        <CountTile
          label="Bounced"
          value={counts ? counts.bounced + counts.complained : undefined}
          help={
            counts?.complained
              ? `Includes ${counts.complained} spam complaint${counts.complained === 1 ? "" : "s"}`
              : undefined
          }
        />
      </section>

      {outcome && (
        <div
          role={outcome.tone === "error" ? "alert" : "status"}
          className={`admin-notice${outcome.tone === "error" ? " admin-notice-error" : ""}`}
        >
          <MailCheck size={16} aria-hidden="true" />
          <div>
            <strong>{outcome.title}</strong>
            <p className="mt-1" style={{ color: "hsl(var(--admin-text))" }}>
              {outcome.body}
            </p>
          </div>
        </div>
      )}

      <div className="admin-card p-4 flex flex-wrap gap-4">
        <label className="flex-1 min-w-[200px] text-sm font-medium">
          <span className="sr-only">Search subscribers</span>
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-3 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={254}
              className="admin-input admin-inquiry-search w-full"
              placeholder="Search email or source"
              aria-label="Search subscribers"
            />
          </div>
        </label>
        <label className="text-sm font-medium">
          <span className="sr-only">Filter by status</span>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as AudienceStatus | "all");
              setPage(0);
            }}
            className="admin-input"
            aria-label="Filter by status"
          >
            <option value="all">Everyone</option>
            {audienceStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QueryNotice
        backendScope="newsletter"
        loading={audience.isPending}
        error={audience.error}
        retry={() => void audience.refetch()}
      />

      {audience.data && !audience.isError && (
        <>
          <p className="admin-help" role="status">
            {matching} {matching === 1 ? "person" : "people"}
            {filter !== "all" ? ` · ${statusLabels[filter]}` : ""}
          </p>
          {audience.data.rows.length ? (
            <div className="admin-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left admin-help">
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Signed up</th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 font-medium">Last confirmation email</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.data.rows.map((row) => (
                    <tr
                      key={row.id}
                      style={{
                        borderTop: "1px solid hsl(var(--admin-border))",
                      }}
                    >
                      <td className="p-3 break-all">{row.email}</td>
                      <td className="p-3">
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                          {statusLabels[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <time dateTime={row.created_at}>
                          {formatDate(row.created_at)}
                        </time>
                      </td>
                      <td className="p-3">{row.source || "—"}</td>
                      <td className="p-3 whitespace-nowrap">
                        {row.status === "pending"
                          ? row.last_confirmation_sent_at
                            ? formatDate(row.last_confirmation_sent_at)
                            : "Never sent"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-card py-14 px-6 text-center">
              <Inbox
                size={34}
                className="mx-auto text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-lg font-semibold">
                {term ? "No matching subscribers" : "No subscribers here yet"}
              </h2>
              <p className="admin-help mt-2">
                {term
                  ? "Try another email address or source."
                  : "Sign-ups from the site's newsletter forms appear here."}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={page === 0 || audience.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span className="admin-help">
              Page {page + 1} of {pages}
            </span>
            <button
              type="button"
              className="admin-btn-secondary"
              disabled={page + 1 >= pages || audience.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          style={{
            backgroundColor: "hsl(var(--admin-surface))",
            border: "1px solid hsl(var(--admin-border))",
            color: "hsl(var(--admin-text))",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body">
              Resend confirmation to {pendingCount} pending{" "}
              {pendingCount === 1 ? "person" : "people"}?
            </AlertDialogTitle>
            <AlertDialogDescription
              className="font-body"
              style={{ color: "hsl(var(--admin-text-soft))" }}
            >
              Each pending sign-up gets one email with a link to confirm. Anyone
              emailed in the last 15 minutes is skipped. Up to 50 are sent per
              run. Nobody is subscribed until they click the link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-body"
              disabled={
                resend.isPending ||
                audience.isFetching ||
                !counts ||
                pendingCount === 0
              }
              onClick={() => {
                setOutcome(null);
                resend.mutate();
              }}
            >
              Send confirmations
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
