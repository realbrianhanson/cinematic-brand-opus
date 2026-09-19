import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  empty,
  toForm,
  slugify,
  payload,
  type Offer,
  type Form,
} from "./offerEditorState";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { errorMessage } from "@/lib/errorMessage";
import { invokeOfferApi, type OfferHealth } from "@/lib/offers";
import QueryNotice from "./QueryNotice";

export default function OfferEditor({ id }: { id?: string }) {
  const [reset, setReset] = useState(0);
  const offer = useQuery({
    queryKey: ["admin-offer", id],
    enabled: !!id,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*")
        .eq("id", id!)
        .abortSignal(AbortSignal.timeout(20000))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (id && (offer.isPending || offer.isError))
    return (
      <QueryNotice
        loading={offer.isPending}
        error={offer.error}
        retry={() => offer.refetch()}
      />
    );
  if (id && !offer.data)
    return (
      <div className="admin-card p-8">
        <h1 className="text-xl font-semibold">Offer not found</h1>
        <p className="admin-help mt-2">
          It may have been removed, or your account may not have access.
        </p>
        <Link to="/admin/offers" className="admin-btn-secondary mt-5">
          Back to offers
        </Link>
      </div>
    );
  return (
    <OfferForm
      key={`${id || "new"}-${reset}`}
      initial={offer.data || null}
      reload={async () => {
        const result = await offer.refetch();
        if (result.error) throw result.error;
        setReset((value) => value + 1);
      }}
    />
  );
}

function OfferForm({
  initial,
  reload,
}: {
  initial: Offer | null;
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const config = useSiteConfig();
  const [form, setForm] = useState<Form>(() =>
    initial ? toForm(initial) : { ...empty },
  );
  const current = useRef(form);
  current.current = form;
  const baseline = useRef(JSON.stringify(form));
  const version = useRef(initial?.updated_at || null);
  const stableId = useRef(initial?.id || "");
  const attemptedCreate = useRef(false);
  const [savedId, setSavedId] = useState(initial?.id || "");
  const [savedSlug, setSavedSlug] = useState(initial?.slug || "");
  const [savedStatus, setSavedStatus] = useState(initial?.status || "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualSlug, setManualSlug] = useState(!!initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== baseline.current;
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const ensureId = () =>
    stableId.current || (stableId.current = crypto.randomUUID());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useBlocker({
    shouldBlockFn: () => {
      if (busy.current) {
        window.alert(
          "Wait for the current save or upload to finish before leaving.",
        );
        return true;
      }
      return (
        JSON.stringify(current.current) !== baseline.current &&
        !window.confirm("Leave this offer? Your unsaved changes will be lost.")
      );
    },
    enableBeforeUnload: () =>
      busy.current || JSON.stringify(current.current) !== baseline.current,
  });
  const choices = useQuery({
    queryKey: ["admin-offer-choices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id,title,status,next_offer_id")
        .order("title")
        .limit(1000)
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      return data ?? [];
    },
  });
  const health = useQuery({
    queryKey: ["admin-offer-health"],
    queryFn: () => invokeOfferApi<OfferHealth>({ action: "health" }),
    staleTime: 30000,
    retry: false,
  });
  const savedLink = savedId
    ? `${config.identity.siteUrl}/offers/${savedSlug}`
    : "";
  const qualifyingParents =
    choices.data?.filter(
      (offer) =>
        offer.next_offer_id === savedId && offer.status === "published",
    ) || [];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    setError("");
    setNotice("");
    let values: TablesInsert<"offers">;
    try {
      values = payload(current.current);
    } catch (failure) {
      setError(errorMessage(failure));
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const id = ensureId();
      if (!version.current && attemptedCreate.current) {
        const result = await supabase
          .from("offers")
          .select("*")
          .eq("id", id)
          .abortSignal(AbortSignal.timeout(20000))
          .maybeSingle();
        if (result.error) throw result.error;
        if (result.data) {
          version.current = result.data.updated_at;
          baseline.current = JSON.stringify(toForm(result.data));
          setSavedId(id);
          setSavedSlug(result.data.slug);
          setSavedStatus(result.data.status);
          setNotice(
            "Your earlier save was received. Your current edits are still here; review them, then save again if needed.",
          );
          return;
        }
      }
      let query;
      if (version.current)
        query = supabase
          .from("offers")
          .update(values)
          .eq("id", id)
          .eq("updated_at", version.current);
      else {
        attemptedCreate.current = true;
        query = supabase.from("offers").insert({ ...values, id });
      }
      const { data, error } = await query
        .select("*")
        .abortSignal(AbortSignal.timeout(25000))
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "This offer changed in another tab. Reload the saved version before making another update; your current edits have not been applied.",
        );
      const saved = toForm(data);
      baseline.current = JSON.stringify(saved);
      current.current = saved;
      version.current = data.updated_at;
      setForm(saved);
      setSavedId(data.id);
      setSavedSlug(data.slug);
      setSavedStatus(data.status);
      setNotice(
        data.status === "published"
          ? "Offer published. Existing orders keep the download and price they originally received."
          : "Offer saved.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-offers"] }),
        qc.invalidateQueries({ queryKey: ["admin-offer-choices"] }),
      ]);
      qc.setQueryData(["admin-offer", data.id], data);
      if (!initial) {
        busy.current = false;
        navigate(`/admin/offers/${data.id}/edit`, { replace: true });
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function upload(file?: File) {
    if (!file || busy.current) return;
    setError("");
    setNotice("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const types: Record<string, string> = {
      pdf: "application/pdf",
      zip: "application/zip",
      epub: "application/epub+zip",
      txt: "text/plain",
      md: "text/plain",
    };
    const contentType = types[extension];
    const allowed = [
      contentType,
      "",
      "application/octet-stream",
      ...(extension === "zip" ? ["application/x-zip-compressed"] : []),
      ...(extension === "md" ? ["text/markdown"] : []),
    ];
    if (!contentType || !allowed.includes(file.type)) {
      setError(
        "Choose a PDF, ZIP, EPUB, TXT, or Markdown file with a matching file type.",
      );
      return;
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      setError("Choose a non-empty file no larger than 25 MB.");
      return;
    }
    if (/[\\/\p{Cc}]/u.test(file.name)) {
      setError(
        "Rename the file without slashes or control characters, then upload it again.",
      );
      return;
    }
    busy.current = true;
    setUploading(true);
    try {
      const path = `${ensureId()}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("offer-files")
        .upload(path, file, { contentType, upsert: false });
      if (error) throw error;
      if (mounted.current) {
        setForm((old) => ({
          ...old,
          assetPath: path,
          assetName: file.name.slice(0, 255),
        }));
        setNotice(
          "File uploaded privately. Save the offer to use it for new claims. Existing orders keep their original file.",
        );
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      busy.current = false;
      if (mounted.current) setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(savedLink);
      setNotice("Published page link copied.");
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setNotice("Select and copy the page link below.");
    }
  }
  async function reloadSaved() {
    if (
      busy.current ||
      (dirty &&
        !window.confirm(
          "Reload the saved version and discard your unsaved changes?",
        ))
    )
      return;
    try {
      await reload();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <form onSubmit={save} className="admin-page-stack">
      <header className="admin-page-header">
        <div>
          <Link className="admin-btn-ghost -ml-3 mb-2" to="/admin/offers">
            <ArrowLeft size={15} /> All offers
          </Link>
          <p className="admin-eyebrow">
            {initial ? "Edit digital offer" : "Create digital offer"}
          </p>
          <h1>{initial ? "Shape the next step" : "Make something useful"}</h1>
          <p>
            {dirty
              ? "You have unsaved changes."
              : savedId
                ? "All changes saved."
                : "Start with a clear promise and a useful download."}
          </p>
        </div>
        <button
          type="submit"
          className="admin-btn-primary"
          disabled={saving || uploading}
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : null}
          {saving
            ? "Saving…"
            : form.status === "published"
              ? "Save & publish"
              : "Save offer"}
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="admin-notice border-red-500/40 text-red-600 dark:text-red-300"
        >
          {error}
          {initial && (
            <button
              type="button"
              className="admin-btn-ghost ml-3"
              onClick={reloadSaved}
            >
              Reload saved version
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      <fieldset
        disabled={saving || uploading}
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="min-w-0 space-y-6">
          <section className="admin-card p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold">The offer page</h2>
            <label className="block text-sm font-medium">
              Title
              <input
                required
                maxLength={160}
                className="admin-input mt-2 w-full"
                placeholder="The practical guide your audience needs"
                value={form.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setForm((old) => ({
                    ...old,
                    title,
                    slug: manualSlug ? old.slug : slugify(title),
                  }));
                }}
              />
            </label>
            <label className="block text-sm font-medium">
              Page URL slug
              <input
                required
                maxLength={120}
                className="admin-input mt-2 w-full"
                value={form.slug}
                onChange={(event) => {
                  setManualSlug(true);
                  update("slug", event.target.value);
                }}
              />
              <span className="admin-help block mt-2">
                /offers/{form.slug || "your-offer"}
                {savedStatus === "published"
                  ? " · Changing this breaks previously shared page links."
                  : ""}
              </span>
            </label>
            <label className="block text-sm font-medium">
              Short promise
              <textarea
                required={form.status === "published"}
                rows={3}
                maxLength={500}
                className="admin-input mt-2 w-full"
                placeholder="What will someone be able to do with this resource?"
                value={form.summary}
                onChange={(event) => update("summary", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Full description
              <textarea
                rows={10}
                maxLength={20000}
                className="admin-input mt-2 w-full"
                placeholder="Explain who it is for, what is inside, and how to use it. Separate paragraphs with a blank line."
                value={form.body}
                onChange={(event) => update("body", event.target.value)}
              />
              <span className="admin-help block mt-2">
                Plain text. Keep claims specific and describe the file honestly.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Cover image URL <span className="admin-help">(optional)</span>
              <input
                type="url"
                maxLength={2000}
                className="admin-input mt-2 w-full"
                placeholder="https://…"
                value={form.cover}
                onChange={(event) => update("cover", event.target.value)}
              />
              <span className="admin-help block mt-2">
                Use an HTTPS image you have permission to share. Leave blank for
                a text-led page.
              </span>
            </label>
          </section>
          <section className="admin-card p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold">Private download</h2>
            <p className="admin-help">
              Customers receive a download button on their confirmation page.
              Files are private and download links are temporary. No delivery
              email is sent automatically.
            </p>
            {form.assetName && (
              <div className="admin-notice flex items-start gap-3">
                <FileText size={20} className="shrink-0 mt-1" />
                <div className="min-w-0">
                  <p className="font-medium break-all">{form.assetName}</p>
                  <p className="admin-help mt-1">
                    {dirty
                      ? "Save to apply any file changes."
                      : "Current file for new claims."}
                  </p>
                </div>
              </div>
            )}
            <label className="block text-sm font-medium">
              <span className="flex items-center gap-2">
                <Upload size={16} />{" "}
                {form.assetName
                  ? "Upload a replacement"
                  : "Upload the resource"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.zip,.epub,.txt,.md"
                className="admin-input mt-3 w-full"
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                }}
              />
              <span className="admin-help block mt-2">
                PDF, ZIP, EPUB, TXT, or Markdown · maximum 25 MB. Replacements
                are saved as new versions; files already purchased are
                preserved.
              </span>
            </label>
            {uploading && (
              <p role="status" className="admin-help flex gap-2">
                <Loader2 size={16} className="animate-spin" /> Uploading
                privately…
              </p>
            )}
            <label className="block text-sm font-medium">
              Confirmation message
              <textarea
                className="admin-input mt-2 w-full"
                rows={3}
                maxLength={2000}
                value={form.thankYou}
                onChange={(event) => update("thankYou", event.target.value)}
              />
            </label>
          </section>
          <section className="admin-card p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold">
              Offer a relevant next step
            </h2>
            <p className="admin-help">
              After successful fulfillment, show an optional follow-up. Visitors
              can decline and keep their original download. A paid follow-up
              always requires a separate checkout.
            </p>
            {choices.isError && (
              <div role="alert" className="admin-notice admin-notice-error">
                Follow-up offers could not be loaded.{" "}
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => {
                    void choices.refetch();
                  }}
                >
                  Try again
                </button>
              </div>
            )}
            <label className="block text-sm font-medium">
              Follow-up offer
              <select
                className="admin-input mt-2 w-full"
                value={form.nextOffer}
                disabled={choices.isPending || choices.isError}
                onChange={(event) => update("nextOffer", event.target.value)}
              >
                <option value="">No follow-up</option>
                {choices.data
                  ?.filter(
                    (offer) =>
                      offer.id !== savedId &&
                      (offer.status !== "archived" ||
                        offer.id === form.nextOffer),
                  )
                  .map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title} ({offer.status})
                    </option>
                  ))}
              </select>
            </label>
            {form.nextOffer && (
              <>
                <label className="block text-sm font-medium">
                  Time available after fulfillment, in minutes
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    step={1}
                    className="admin-input mt-2 w-full"
                    value={form.window}
                    onChange={(event) => update("window", event.target.value)}
                  />
                  <span className="admin-help block mt-2">
                    0 means no timer. Otherwise use 30–10,080 minutes (up to
                    seven days). The deadline starts after the original order is
                    fulfilled and does not reset on a refresh.
                  </span>
                </label>
                <p className="admin-help">
                  The follow-up must be published to appear. Existing orders
                  keep the follow-up and time window in place when they were
                  created.
                </p>
              </>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.funnelOnly}
                onChange={(event) => update("funnelOnly", event.target.checked)}
              />
              <span>
                <strong>Make this offer available only as a follow-up</strong>
                <span className="admin-help block mt-1">
                  Its page may be viewed, but a qualifying original claim is
                  required. Link to this offer from another published offer
                  before sharing your flow.
                </span>
              </span>
            </label>
            {form.funnelOnly && (
              <p className="admin-help">
                {qualifyingParents.length
                  ? `Linked from: ${qualifyingParents.map((offer) => offer.title).join(", ")}.`
                  : "No published parent offer is linked yet. Save this offer, then edit its parent and choose it as the follow-up."}
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-6 min-w-0">
          <section className="admin-card p-5 space-y-5">
            <h2 className="text-lg font-semibold">Price & availability</h2>
            <label className="block text-sm font-medium">
              Offer type
              <select
                className="admin-input mt-2 w-full"
                value={form.kind}
                onChange={(event) =>
                  update("kind", event.target.value as Form["kind"])
                }
              >
                <option value="free">Free download</option>
                <option value="paid">Paid digital product</option>
              </select>
            </label>
            {form.kind === "paid" && (
              <>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <label className="block text-sm font-medium">
                    Price
                    <input
                      required
                      inputMode="decimal"
                      className="admin-input mt-2 w-full"
                      placeholder="19.00"
                      value={form.price}
                      onChange={(event) => update("price", event.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Currency
                    <select
                      className="admin-input mt-2 w-full"
                      value={form.currency}
                      onChange={(event) =>
                        update("currency", event.target.value)
                      }
                    >
                      {["usd", "cad", "eur", "gbp", "aud"].map((currency) => (
                        <option key={currency} value={currency}>
                          {currency.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="admin-help">
                  One-time payment through Stripe Checkout. Price is stored
                  exactly to the cent; no recurring or automatic charges.
                </p>
                <div className="admin-notice text-sm">
                  {health.isPending
                    ? "Checking Stripe setup…"
                    : health.isError
                      ? "Stripe readiness is unknown. Check setup before sharing a paid offer."
                      : health.data?.payments_ready
                        ? `Stripe ${health.data.mode} configuration is present. A real checkout has not been verified by this check.`
                        : "You can save or publish this page now. Checkout stays unavailable until Stripe setup is complete."}
                  <Link to="/admin/offers" className="underline block mt-2">
                    Offers setup
                  </Link>
                </div>
              </>
            )}
            <label className="block text-sm font-medium">
              Status
              <select
                className="admin-input mt-2 w-full"
                value={form.status}
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="draft">Draft — admin preview only</option>
                <option value="published">Published — public page</option>
                <option value="archived">Archived — stop new claims</option>
              </select>
            </label>
            <p className="admin-help">
              Archiving preserves orders and their download access. Publishing
              requires a title, summary, valid slug, and uploaded file.
            </p>
          </section>
          <section className="admin-card p-5 space-y-4">
            <h2 className="text-lg font-semibold">Preview & share</h2>
            {savedId ? (
              <>
                <a
                  className="admin-btn-secondary w-full"
                  href={`/offers/preview/${savedId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preview saved version <ArrowUpRight size={15} />
                </a>
                {dirty && (
                  <p className="admin-help">
                    Save first to include your latest edits in the preview.
                  </p>
                )}
                {savedStatus === "published" ? (
                  <>
                    <label className="block text-sm font-medium">
                      Published page
                      <input
                        ref={linkRef}
                        readOnly
                        className="admin-input mt-2 w-full"
                        value={savedLink}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-btn-secondary w-full"
                      onClick={copyLink}
                    >
                      <Copy size={15} /> Copy page link
                    </button>
                    <a
                      className="admin-btn-ghost w-full"
                      href={savedLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open published page <ArrowUpRight size={15} />
                    </a>
                    {form.funnelOnly && (
                      <p className="admin-help">
                        Share the parent offer first. A direct link does not
                        bypass the follow-up requirement.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="admin-help">
                    Publish when ready to get a public share link. Draft
                    previews require an administrator session.
                  </p>
                )}
              </>
            ) : (
              <p className="admin-help">
                Save your draft to open a private preview.
              </p>
            )}
          </section>
        </aside>
      </fieldset>
    </form>
  );
}
