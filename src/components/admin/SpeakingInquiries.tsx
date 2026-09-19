import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Inbox, Mail, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  inquiryStatuses,
  inquiryStatusLabels,
  type InquiryStatus,
} from "@/lib/speakingInquiries";
import QueryNotice from "./QueryNotice";

type Inquiry = Omit<
  Tables<"speaking_inquiries">,
  "request_id" | "payload_hash"
>;
const PAGE_SIZE = 20;
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatLabels: Record<string, string> = {
  in_person: "In person",
  virtual: "Virtual",
  undecided: "Still deciding",
};

export function InquiryDetail({
  inquiry,
  back,
}: {
  inquiry: Inquiry;
  back: () => void;
}) {
  const client = useQueryClient();
  const [status, setStatus] = useState(inquiry.status);
  const [notes, setNotes] = useState(inquiry.admin_notes);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(inquiry.updated_at);
  const [baseline, setBaseline] = useState({
    status: inquiry.status,
    notes: inquiry.admin_notes,
  });
  const changed = status !== baseline.status || notes !== baseline.notes;
  const save = useMutation({
    mutationFn: async () => {
      if (
        !inquiryStatuses.includes(status as InquiryStatus) ||
        notes.length > 5000
      )
        throw new Error("Please check the status and notes.");
      const { data, error } = await supabase
        .from("speaking_inquiries")
        .update({ status, admin_notes: notes })
        .eq("id", inquiry.id)
        .eq("updated_at", version)
        .select("updated_at")
        .maybeSingle();
      if (error)
        throw new Error(
          "Changes could not be saved. Your notes are still here; please try again.",
        );
      if (!data)
        throw new Error(
          "This inquiry changed in another window. Copy your notes, choose Back to inbox, then reopen the inquiry to load its latest details before saving again. If its status changed, choose All inquiries to find it.",
        );
      return data;
    },
    onSuccess: (data) => {
      setVersion(data.updated_at);
      setBaseline({ status, notes });
      setSaved(true);
      void client.invalidateQueries({ queryKey: ["speaking-inquiries"] });
      void client.invalidateQueries({ queryKey: ["admin-post-stats"] });
    },
  });
  const email = `mailto:${encodeURIComponent(inquiry.email).replace("%40", "@")}?subject=${encodeURIComponent(`Re: ${inquiry.event_name}`)}`;
  return (
    <section
      className="admin-card overflow-hidden"
      aria-labelledby="inquiry-detail-heading"
    >
      <div className="border-b border-border p-5 sm:p-6">
        <button type="button" onClick={back} className="admin-btn-ghost mb-4">
          <ArrowLeft size={15} /> Back to inbox
        </button>
        <p className="admin-eyebrow">
          Speaking inquiry · {formatDate(inquiry.created_at)}
        </p>
        <h2
          id="inquiry-detail-heading"
          className="mt-2 text-xl font-semibold break-words"
        >
          {inquiry.event_name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          From {inquiry.name}
        </p>
        <a className="admin-btn-primary mt-4 inline-flex" href={email}>
          <Mail size={16} /> Reply by email
        </a>
        <p className="admin-help mt-2">
          Opens your email app. Mark the inquiry as contacted after you reply.
        </p>
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          {[
            ["Contact", inquiry.email],
            ["Date or timeframe", inquiry.event_date || "Not provided"],
            ["Format", formatLabels[inquiry.event_format] || "Still deciding"],
            ["Audience", inquiry.audience || "Not provided"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words font-medium">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Event goals and details
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {inquiry.message || "No additional details provided."}
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          className="space-y-4 border-t border-border pt-5"
        >
          <label className="block text-sm font-medium">
            Status
            <select
              value={status}
              disabled={save.isPending}
              onChange={(event) => {
                setStatus(event.target.value);
                setSaved(false);
              }}
              className="admin-input mt-2 w-full"
            >
              {inquiryStatuses.map((value) => (
                <option key={value} value={value}>
                  {inquiryStatusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Private notes
            <textarea
              value={notes}
              disabled={save.isPending}
              onChange={(event) => {
                setNotes(event.target.value);
                setSaved(false);
              }}
              maxLength={5000}
              rows={5}
              placeholder="Follow-up plans, fit, budget, or next steps"
              className="admin-input mt-2 w-full resize-y"
            />
          </label>
          <p className="admin-help">
            Only administrators can see these notes. Nothing is sent to the
            organizer.
          </p>
          {save.error && (
            <p role="alert" className="admin-notice admin-notice-error">
              {save.error.message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="admin-btn-primary"
              type="submit"
              disabled={save.isPending || !changed}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <p
                role="status"
                className="inline-flex items-center gap-1 text-sm text-emerald-600"
              >
                <Check size={15} /> Saved
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

export default function SpeakingInquiries() {
  const client = useQueryClient();
  const [filter, setFilter] = useState("new");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const settings = useQuery({
    queryKey: ["speaking-inquiries", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings_private")
        .select("id,speaking_inquiries_enabled")
        .order("id")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const enabled = settings.data?.speaking_inquiries_enabled === true;
  const toggle = useMutation({
    mutationFn: async () => {
      if (!settings.data)
        throw new Error("Complete site setup before accepting inquiries.");
      const { data, error } = await supabase
        .from("site_settings_private")
        .update({ speaking_inquiries_enabled: !enabled })
        .eq("id", settings.data.id)
        .eq("speaking_inquiries_enabled", enabled)
        .select("speaking_inquiries_enabled")
        .maybeSingle();
      if (error || !data)
        throw new Error(
          "The setting could not be updated. Refresh and try again.",
        );
    },
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["speaking-inquiries", "settings"],
      });
    },
  });
  const inquiries = useQuery({
    queryKey: ["speaking-inquiries", "list", filter, term, page],
    queryFn: async () => {
      let query = supabase
        .from("speaking_inquiries")
        .select(
          "id,name,email,event_name,event_date,event_format,audience,message,status,admin_notes,created_at,updated_at",
          { count: "exact" },
        );
      if (filter !== "all") query = query.eq("status", filter);
      if (term) {
        const match = JSON.stringify(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
        query = query.or(
          `name.ilike.${match},email.ilike.${match},event_name.ilike.${match}`,
        );
      }
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Relationships</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Speaking inquiries
          </h1>
          <p className="admin-help mt-2">
            Every event opportunity, with context and a clear next step.
          </p>
        </div>
        {!selected && (
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={inquiries.isFetching}
            onClick={() => {
              void inquiries.refetch();
              void settings.refetch();
            }}
          >
            <RefreshCw size={15} /> Refresh inbox
          </button>
        )}
      </header>
      <section
        className="admin-card p-5 flex flex-wrap items-center justify-between gap-4"
        aria-label="Inquiry availability"
      >
        <div>
          <h2 className="font-semibold">
            {settings.isPending
              ? "Checking availability…"
              : enabled
                ? "Accepting speaking inquiries"
                : "Online inquiries paused"}
          </h2>
          <p className="admin-help mt-1">
            {enabled
              ? "New submissions appear here. Check this inbox regularly; automatic email notifications are not enabled."
              : "Enable when you’re ready to receive event inquiries. Existing conversations remain available."}
          </p>
        </div>
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={
            settings.isPending ||
            settings.isError ||
            !settings.data ||
            toggle.isPending
          }
          onClick={() => toggle.mutate()}
        >
          {toggle.isPending
            ? "Updating…"
            : enabled
              ? "Pause inquiries"
              : "Accept inquiries"}
        </button>
      </section>
      <QueryNotice
        error={settings.error}
        retry={() => {
          void settings.refetch();
        }}
      />
      {toggle.error && (
        <p role="alert" className="admin-notice admin-notice-error">
          {toggle.error.message}
        </p>
      )}
      {selected ? (
        <InquiryDetail
          key={selected.id}
          inquiry={selected}
          back={() => {
            setSelected(null);
            void inquiries.refetch();
          }}
        />
      ) : (
        <>
          <div className="admin-card p-4 flex flex-wrap gap-4">
            <label className="flex-1 min-w-[200px] text-sm font-medium">
              <span className="sr-only">Search inquiries</span>
              <div className="relative">
                <Search
                  size={17}
                  className="absolute left-3 top-3 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={100}
                  className="admin-input admin-inquiry-search w-full"
                  placeholder="Search name, email, or event"
                  aria-label="Search inquiries"
                />
              </div>
            </label>
            <label className="text-sm font-medium">
              <span className="sr-only">Filter by status</span>
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(0);
                }}
                className="admin-input"
                aria-label="Filter by status"
              >
                <option value="all">All inquiries</option>
                {inquiryStatuses.map((value) => (
                  <option key={value} value={value}>
                    {inquiryStatusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <QueryNotice
            loading={inquiries.isPending}
            error={inquiries.error}
            retry={() => {
              void inquiries.refetch();
            }}
          />
          {inquiries.data && !inquiries.isError && (
            <>
              <p className="admin-help" role="status">
                {inquiries.data.count}{" "}
                {inquiries.data.count === 1 ? "inquiry" : "inquiries"}
                {filter !== "all"
                  ? ` · ${inquiryStatusLabels[filter as InquiryStatus]}`
                  : ""}
              </p>
              {inquiries.data.rows.length ? (
                <ul className="space-y-3">
                  {inquiries.data.rows.map((inquiry) => (
                    <li key={inquiry.id}>
                      <button
                        type="button"
                        disabled={inquiries.isFetching}
                        onClick={() => setSelected(inquiry)}
                        className="admin-card w-full p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-wait"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold break-words">
                            {inquiry.event_name}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                            {
                              inquiryStatusLabels[
                                inquiry.status as InquiryStatus
                              ]
                            }
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground break-words">
                          {inquiry.name} · {inquiry.email}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <time dateTime={inquiry.created_at}>
                            Received {formatDate(inquiry.created_at)}
                          </time>
                          {inquiry.event_date && (
                            <span>Event: {inquiry.event_date}</span>
                          )}
                          <span>{formatLabels[inquiry.event_format]}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="admin-card py-14 px-6 text-center">
                  <Inbox
                    size={34}
                    className="mx-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h2 className="mt-4 text-lg font-semibold">
                    {term
                      ? "No matching inquiries"
                      : filter === "new"
                        ? "You’re caught up"
                        : "No inquiries here yet"}
                  </h2>
                  <p className="admin-help mt-2">
                    {term
                      ? "Try another name, email, or event."
                      : "Event organizers can get in touch through your speaking page."}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <button
                  className="admin-btn-secondary"
                  disabled={page === 0 || inquiries.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <span className="admin-help">
                  Page {page + 1} of{" "}
                  {Math.max(1, Math.ceil(inquiries.data.count / PAGE_SIZE))}
                </span>
                <button
                  className="admin-btn-secondary"
                  disabled={
                    (page + 1) * PAGE_SIZE >= inquiries.data.count ||
                    inquiries.isFetching
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
