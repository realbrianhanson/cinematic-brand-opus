import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  clearOfferHandoff,
  draftPayload,
  empty,
  formIssues,
  payload,
  readOfferHandoff,
  saveOfferHandoff,
  slugify,
  toForm,
  type Form,
  type Offer,
  type OfferHandoff,
} from "./offerEditorState";
import { waitForUpload } from "@/lib/uploadWait";
import { errorMessage, isErrorCode } from "@/lib/errorMessage";
import {
  invokeOfferApi,
  type OfferHealth,
  type PublicOffer,
} from "@/lib/offers";
import {
  builderFromOffer,
  sectionFromProof,
  offerBuilderSchema,
  reviewOffer,
  type OfferBuilder,
  type OfferPage,
  type OfferProof,
} from "@/lib/offerBuilder";
import {
  builderIssues,
  type OfferIssue,
  type OfferStep,
} from "@/lib/offerBuilderValidation";
import { offerChanges, sameOfferContent } from "@/lib/offerBuilderDiff";
import {
  loadOfferBuilder,
  saveOfferBuilder,
  type OfferBuilderLoadResult,
  type OfferBuilderDocument,
  type OfferBuilderSaveInput,
} from "@/lib/offerBuilderClient";
import type { OfferStatusChange, OfferStatusRow } from "@/lib/offersStatus";
import { statusChangeCopy } from "@/lib/offersStatus";
import QueryNotice from "./QueryNotice";
import OfferShopSettings from "./OfferShopSettings";
import OfferBuilderShare from "./offers/OfferBuilderShare";
import OfferImageInsert from "./OfferImageInsert";
import OfferStrategyFields from "./offers/OfferStrategyFields";
import OfferPageFields from "./offers/OfferPageFields";
import OfferCopyAssistant from "./offers/OfferCopyAssistant";
import OfferProofLibrary from "./offers/OfferProofLibrary";
import OfferBuilderPreview from "@/components/offers/OfferBuilderPreview";
import OfferNextStep from "./OfferNextStep";
import OfferDeliveryStep from "./OfferDeliveryStep";
import OfferIssueList from "./OfferIssueList";
import OfferConfirmDialog from "./OfferConfirmDialog";
import OfferRevisionHistory from "./OfferRevisionHistory";
import OfferReviewStatus from "./OfferReviewStatus";
import OfferJourneyReadiness from "./offers/OfferJourneyReadiness";

const workflow: { id: OfferStep; title: string; detail: string }[] = [
  { id: "strategy", title: "Strategy", detail: "Buyer, promise & proof" },
  { id: "pages", title: "Pages", detail: "Copy & presentation" },
  { id: "next", title: "Next step", detail: "A relevant follow-up" },
  { id: "delivery", title: "Delivery", detail: "Price, checkout & access" },
  { id: "review", title: "Review", detail: "Check, publish & share" },
];
type PageStage = "landing" | "upsell" | "thank-you";
const serialize = (form: Form, builder: OfferBuilder) =>
  JSON.stringify({ form, builder });
const PUBLISHED_NOTICE =
  "Offer published. Your new copy and settings are now live. Existing orders keep their original price and download.";
const DRAFT_NOTICE =
  "Draft saved privately. Your public offer has not changed.";

/** A draft is stale only when the live content changed after it was saved. */
function draftIsStale(initial: Offer | null, saved: OfferBuilderLoadResult) {
  const draft = saved.draft;
  if (!initial || !draft) return false;
  if (draft.base_offer_updated_at === initial.updated_at) return false;
  return !(draft.base_offer && sameOfferContent(initial, draft.base_offer));
}

export default function OfferEditor({ id }: { id?: string }) {
  const [reset, setReset] = useState(0);
  // Context carried from the new-offer route (notice, step, unsaved copy).
  const [handoff] = useState(() => (id ? readOfferHandoff(id) : null));
  useEffect(() => {
    if (id) clearOfferHandoff(id);
  }, [id]);
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
      return {
        offer: data,
        builderState: data
          ? await loadOfferBuilder(data.id)
          : { draft: null, history: [] },
      };
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
  if (id && !offer.data?.offer)
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
      initial={offer.data?.offer || null}
      savedBuilder={offer.data?.builderState || { draft: null, history: [] }}
      handoff={reset === 0 ? handoff : null}
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
  savedBuilder,
  handoff,
  reload,
}: {
  initial: Offer | null;
  savedBuilder: OfferBuilderLoadResult;
  handoff: OfferHandoff | null;
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [savedForm] = useState<Form>(() =>
    initial
      ? toForm({ ...initial, ...savedBuilder.draft?.document.offer })
      : { ...empty },
  );
  const [savedPages] = useState<OfferBuilder>(
    () => savedBuilder.draft?.document.builder || builderFromOffer(initial),
  );
  const [form, setForm] = useState<Form>(() => handoff?.form || savedForm);
  const [builder, setBuilder] = useState<OfferBuilder>(
    () => handoff?.builder || savedPages,
  );
  const [step, setStep] = useState<OfferStep>(
    handoff?.step || (initial ? "pages" : "strategy"),
  );
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    headerRef.current?.scrollIntoView?.({ block: "start" });
  }, [step]);
  const [stage, setStage] = useState<PageStage>("landing");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [history, setHistory] = useState(savedBuilder.history);
  const [staleDraft, setStaleDraft] = useState(
    () => !handoff?.form && draftIsStale(initial, savedBuilder),
  );
  const draftVersion = useRef(savedBuilder.draft?.version ?? null);
  const liveOffer = useRef(initial);
  const pendingSave = useRef<{
    fingerprint: string;
    input: OfferBuilderSaveInput;
  } | null>(null);
  const currentBuilder = useRef(builder);
  currentBuilder.current = builder;
  const current = useRef(form);
  current.current = form;
  const baseline = useRef(serialize(savedForm, savedPages));
  const version = useRef(initial?.updated_at || null);
  const stableId = useRef(initial?.id || "");
  const [savedId, setSavedId] = useState(initial?.id || "");
  const [savedSlug, setSavedSlug] = useState(initial?.slug || "");
  const [savedStatus, setSavedStatus] = useState(initial?.status || "draft");
  const [savedInShop, setSavedInShop] = useState(
    initial?.show_in_shop || false,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadController = useRef<AbortController | null>(null);
  const [evidenceState, setEvidenceState] = useState({
    dirty: false,
    busy: false,
  });
  const evidenceCurrent = useRef(evidenceState);
  evidenceCurrent.current = evidenceState;
  const [confirmPublish, setConfirmPublish] = useState(false);
  const busy = useRef(false);
  const leaving = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<OfferIssue[]>([]);
  const [notice, setNotice] = useState(handoff?.notice || "");
  const [manualSlug, setManualSlug] = useState(!!initial && !!form.slug);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty =
    serialize(form, builder) !== baseline.current || evidenceState.dirty;
  const external = form.checkoutMode === "external";
  const effectiveStage = external ? "landing" : stage;
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const patchForm = (changes: Partial<Form>) =>
    setForm((old) => ({ ...old, ...changes }));
  const ensureId = () =>
    stableId.current || (stableId.current = crypto.randomUUID());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
    };
  }, []);
  useBlocker({
    shouldBlockFn: () => {
      if (leaving.current) return false;
      if (busy.current || evidenceCurrent.current.busy) {
        window.alert(
          "Wait for the current save or upload to finish before leaving.",
        );
        return true;
      }
      return (
        (evidenceCurrent.current.dirty ||
          serialize(current.current, currentBuilder.current) !==
            baseline.current) &&
        !window.confirm("Leave this offer? Your unsaved changes will be lost.")
      );
    },
    enableBeforeUnload: () =>
      !leaving.current &&
      (busy.current ||
        evidenceCurrent.current.busy ||
        evidenceCurrent.current.dirty ||
        serialize(current.current, currentBuilder.current) !==
          baseline.current),
  });
  const choices = useQuery({
    queryKey: ["admin-offer-choices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id,title,status,next_offer_id,funnel_only")
        .eq("checkout_mode", "native")
        .order("title")
        .limit(1000)
        .abortSignal(AbortSignal.timeout(20000));
      if (error) throw error;
      return data ?? [];
    },
  });
  const health = useQuery({
    queryKey: ["admin-offer-health"],
    enabled: !external,
    queryFn: () => invokeOfferApi<OfferHealth>({ action: "health" }),
    staleTime: 30000,
    retry: false,
  });
  const selectedNextOffer = useQuery({
    queryKey: ["admin-offer-follow-up-preview", form.nextOffer],
    enabled: !external && !!form.nextOffer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(
          "id,slug,title,summary,body,cover_url,status,kind,checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure,amount_minor,currency,thank_you_message,funnel_only,created_at,updated_at,presentation",
        )
        .eq("id", form.nextOffer)
        .abortSignal(AbortSignal.timeout(20000))
        .maybeSingle();
      if (error) throw error;
      return data as PublicOffer | null;
    },
  });
  const qualifyingParents =
    choices.data?.filter(
      (offer) =>
        offer.next_offer_id === savedId && offer.status === "published",
    ) || [];
  const offerTitle = (offerId: string) =>
    choices.data?.find((item) => item.id === offerId)?.title || "";
  const pagesIssues = builderIssues(builder);
  const draftIssues = [...draftPayload(form).issues, ...pagesIssues];
  const publishIssues = [
    ...formIssues({ ...form, status: "published" }),
    ...pagesIssues,
  ];

  function showIssues(list: OfferIssue[], summary: string) {
    setIssues(list);
    setError(summary);
  }

  function buildDocument(publish: boolean): OfferBuilderDocument | null {
    const list = publish ? publishIssues : draftIssues;
    if (list.length) {
      showIssues(
        list,
        publish
          ? "Fix these before publishing. Your working copy is unchanged."
          : "Fix these before saving your draft. Your working copy is unchanged.",
      );
      return null;
    }
    try {
      return {
        offer: publish
          ? payload({ ...current.current, status: "published" })
          : draftPayload(current.current).values,
        builder: offerBuilderSchema.parse(currentBuilder.current),
      };
    } catch (failure) {
      setError(errorMessage(failure));
      return null;
    }
  }

  // A lost response to the first save leaves a created row this editor does
  // not know about. Open that row and carry the local copy across.
  async function recoverCreatedOffer(): Promise<boolean> {
    const offerId = stableId.current;
    if (initial || !offerId) return false;
    const { data, error } = await supabase
      .from("offers")
      .select("id")
      .eq("id", offerId)
      .abortSignal(AbortSignal.timeout(20000))
      .maybeSingle();
    if (!mounted.current) return true;
    if (error) {
      setError(
        `We couldn't check whether your first save created this offer (${errorMessage(error)}). Your edits are still here. Check All offers before saving again.`,
      );
      return true;
    }
    if (!data) return false;
    saveOfferHandoff(data.id, {
      form: current.current,
      builder: currentBuilder.current,
      step,
      notice:
        "Your first save reached the server, but its confirmation was lost. We opened the saved offer and kept your latest edits here. Review them, then save again.",
    });
    leaving.current = true;
    navigate(`/admin/offers/${data.id}/edit`, { replace: true });
    return true;
  }

  function saveFailed(failure: unknown) {
    if (isErrorCode(failure, "23505"))
      showIssues(
        [
          {
            step: "pages",
            field: "Page URL slug",
            message: errorMessage(failure),
          },
        ],
        "This offer could not be published.",
      );
    else if (isErrorCode(failure, "22023") && draftIssues.length)
      showIssues(draftIssues, "The server could not store these details.");
    else setError(errorMessage(failure));
  }

  async function save(publish = false) {
    if (busy.current) return;
    if (evidenceCurrent.current.busy || evidenceCurrent.current.dirty) {
      setError(
        "Save or discard your evidence edits in Strategy before saving this offer. Evidence is saved separately.",
      );
      setStep("strategy");
      return;
    }
    setError("");
    setIssues([]);
    setNotice("");
    setConfirmPublish(false);
    if (staleDraft) {
      setError(
        "Choose whether to keep this draft or use the current published content before saving.",
      );
      setStep("review");
      return;
    }
    const document = buildDocument(publish);
    if (!document) return;
    const fingerprint = JSON.stringify({
      document,
      publish,
      version: version.current,
      draftVersion: draftVersion.current,
    });
    const input =
      pendingSave.current?.fingerprint === fingerprint
        ? pendingSave.current.input
        : {
            offerId: ensureId(),
            document,
            publish,
            requestId: crypto.randomUUID(),
            expectedOfferUpdatedAt: version.current,
            expectedDraftVersion: draftVersion.current,
          };
    pendingSave.current = { fingerprint, input };
    busy.current = true;
    setSaving(true);
    try {
      const result = await saveOfferBuilder(input);
      if (!mounted.current) return;
      const saved = toForm({ ...result.offer, ...result.draft.document.offer });
      const nextBuilder = result.draft.document.builder;
      baseline.current = serialize(saved, nextBuilder);
      current.current = saved;
      currentBuilder.current = nextBuilder;
      version.current = result.offer.updated_at;
      draftVersion.current = result.draft.version;
      liveOffer.current = result.offer;
      pendingSave.current = null;
      setForm(saved);
      setBuilder(nextBuilder);
      setSavedId(result.offer.id);
      setSavedSlug(result.offer.slug);
      setSavedStatus(result.offer.status);
      setSavedInShop(result.offer.show_in_shop);
      const revision = {
        id: result.revision_id,
        document: result.draft.document,
        version: result.draft.version,
        published: result.published,
        created_at: result.draft.updated_at,
      };
      const nextHistory = [
        revision,
        ...history.filter((item) => item.id !== revision.id),
      ].slice(0, 30);
      setHistory(nextHistory);
      const savedNotice = publish ? PUBLISHED_NOTICE : DRAFT_NOTICE;
      setNotice(savedNotice);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-offers"] }),
        qc.invalidateQueries({ queryKey: ["admin-offer-choices"] }),
        qc.invalidateQueries({ queryKey: ["admin-offer-drafts"] }),
      ]);
      qc.setQueryData(["admin-offer", result.offer.id], {
        offer: result.offer,
        builderState: { draft: result.draft, history: nextHistory },
      });
      if (!initial) {
        busy.current = false;
        saveOfferHandoff(result.offer.id, { notice: savedNotice, step });
        navigate(`/admin/offers/${result.offer.id}/edit`, { replace: true });
      }
    } catch (failure) {
      if (!mounted.current) return;
      busy.current = false;
      if (isErrorCode(failure, "40001") && (await recoverCreatedOffer()))
        return;
      if (mounted.current) saveFailed(failure);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function requestPublish() {
    setError("");
    setIssues([]);
    setNotice("");
    if (staleDraft) return void save(true);
    if (publishIssues.length)
      return showIssues(
        publishIssues,
        "Fix these before publishing. Your working copy is unchanged.",
      );
    setConfirmPublish(true);
  }

  function statusChanged(row: OfferStatusRow, change: OfferStatusChange) {
    version.current = row.updated_at;
    if (liveOffer.current)
      liveOffer.current = {
        ...liveOffer.current,
        status: row.status,
        updated_at: row.updated_at,
      };
    pendingSave.current = null;
    setSavedStatus(row.status);
    setError("");
    setNotice(statusChangeCopy[change].done);
    void qc.invalidateQueries({ queryKey: ["admin-offer", row.id] });
    void qc.invalidateQueries({ queryKey: ["admin-offers"] });
    void qc.invalidateQueries({ queryKey: ["admin-offer-choices"] });
  }

  function restoreDocument(document: OfferBuilderDocument) {
    if (!liveOffer.current) return;
    const restored = toForm({ ...liveOffer.current, ...document.offer });
    setForm(restored);
    setBuilder(document.builder);
    setNotice(
      "Revision restored to your working copy. Save a private draft or publish when ready.",
    );
    setStep("pages");
  }
  const revisionChanges = (document: OfferBuilderDocument) =>
    liveOffer.current
      ? offerChanges(
          { ...draftPayload(form).values, status: undefined },
          {
            ...draftPayload(toForm({ ...liveOffer.current, ...document.offer }))
              .values,
            status: undefined,
          },
          { offerTitle },
        )
      : [];

  function updatePage(page: OfferPage, pageStage: "landing" | "upsell") {
    // Both editors must agree even when the author deliberately clears a CTA.
    // Leave an untouched legacy fallback alone when changing another page field.
    if (
      pageStage === "landing" &&
      page.ctaText !== currentBuilder.current.presentation.landing.ctaText
    )
      update("externalButtonText", page.ctaText);
    setBuilder((old) => ({
      ...old,
      presentation: { ...old.presentation, [pageStage]: page },
    }));
  }
  function insertProof(proof: OfferProof) {
    const pageStage = effectiveStage === "upsell" ? "upsell" : "landing";
    const page = builder.presentation[pageStage];
    if (page.sections.length >= 30) {
      setError(
        "This page already has 30 sections. Remove one before inserting proof.",
      );
      return;
    }
    const section = sectionFromProof(proof);
    setBuilder((old) => ({
      ...old,
      proofIds: [...new Set([...old.proofIds, proof.id])].slice(0, 30),
      presentation: {
        ...old.presentation,
        [pageStage]: {
          ...old.presentation[pageStage],
          sections: [...old.presentation[pageStage].sections, section],
        },
      },
    }));
  }

  async function upload(file?: File) {
    if (!file || busy.current) return;
    setError("");
    setIssues([]);
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
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const path = `${ensureId()}/${crypto.randomUUID()}.${extension}`;
      const { error } = await waitForUpload(
        supabase.storage
          .from("offer-files")
          .upload(path, file, { contentType, upsert: false }),
        controller.signal,
      );
      if (controller.signal.aborted || uploadController.current !== controller)
        return;
      if (error) throw error;
      if (mounted.current) {
        setForm((old) => ({
          ...old,
          assetPath: path,
          assetName: file.name.slice(0, 255),
        }));
        setNotice(
          "File uploaded privately. Save a draft to keep it, then publish to use it for new claims. Existing orders keep their original file.",
        );
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (uploadController.current === controller) {
        uploadController.current = null;
        controller.abort();
        busy.current = false;
        if (mounted.current) setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
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

  const previewOffer: PublicOffer = {
    id: savedId || "preview",
    slug: form.slug,
    title: form.title || "Your offer title",
    summary: form.summary,
    body: form.body,
    cover_url: form.cover || null,
    status: "draft",
    kind: form.kind,
    checkout_mode: form.checkoutMode,
    price_display_mode: form.priceDisplayMode,
    external_url: form.externalUrl || null,
    external_button_text: form.externalButtonText,
    is_affiliate: form.isAffiliate,
    affiliate_disclosure: form.affiliateDisclosure || null,
    amount_minor: /^\d+(?:\.\d{1,2})?$/.test(form.price.trim())
      ? Math.round(Number(form.price) * 100)
      : 0,
    currency: form.currency,
    thank_you_message: form.thankYou,
    funnel_only: form.funnelOnly,
    created_at: initial?.created_at || "",
    updated_at: initial?.updated_at || "",
  };
  const advice = reviewOffer(builder, previewOffer);
  const stepIndex = workflow.findIndex((item) => item.id === step);
  const nextChoice = choices.data?.find((item) => item.id === form.nextOffer);
  const latest = history[0];
  const unpublishedDraft =
    savedStatus === "published" && !!latest && !latest.published;
  const publishChanges = confirmPublish
    ? offerChanges(
        liveOffer.current,
        payload({ ...form, status: "published" }),
        { offerTitle },
      )
    : [];

  return (
    <div className="admin-page-stack">
      <header ref={headerRef} className="admin-page-header">
        <div>
          <Link className="admin-btn-ghost -ml-3 mb-2" to="/admin/offers">
            <ArrowLeft size={15} /> All offers
          </Link>
          <p className="admin-eyebrow">Offer studio</p>
          <h1>
            {initial
              ? "Build a stronger offer"
              : "Turn a useful product into a compelling offer"}
          </h1>
          <p>
            {dirty
              ? "You have unsaved changes."
              : savedId
                ? "Your working copy is saved."
                : "Start with the buyer. Build the page. Make the next step clear."}
            {unpublishedDraft && (
              <span className="admin-badge ml-2 align-middle">
                Draft changes not published
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="admin-btn-secondary"
            disabled={saving || uploading}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}{" "}
            Save draft
          </button>
          {step === "review" ? (
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saving || uploading || staleDraft}
              onClick={requestPublish}
            >
              Publish changes
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saving || uploading}
              onClick={() => setStep("review")}
            >
              Review & publish <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="admin-notice border-red-500/40 text-red-600 dark:text-red-300"
        >
          {error}
          <OfferIssueList issues={issues} onGo={setStep} />
          {initial && !issues.length && (
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
      {staleDraft && (
        <div role="alert" className="admin-notice space-y-3">
          <p>
            This draft was started before the public offer was last changed.
            Review its copy, price and delivery settings before keeping it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => {
                setStaleDraft(false);
                setNotice(
                  "Keeping this draft as your working copy. The public page has not changed.",
                );
              }}
            >
              Keep this draft
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => {
                if (liveOffer.current) {
                  setForm(toForm(liveOffer.current));
                  setBuilder(builderFromOffer(liveOffer.current));
                  setStaleDraft(false);
                  setNotice(
                    "Current public content loaded into your working copy. Save a draft to replace the old draft.",
                  );
                }
              }}
            >
              Use current public content
            </button>
          </div>
        </div>
      )}
      <fieldset
        disabled={saving || uploading}
        className="grid min-w-0 gap-6 2xl:grid-cols-[160px_minmax(0,1fr)]"
      >
        <nav aria-label="Offer builder steps" className="min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-2 2xl:sticky 2xl:top-5 2xl:flex-col 2xl:overflow-visible">
            {workflow.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-current={step === item.id ? "step" : undefined}
                className={`shrink-0 rounded-xl border p-3 text-left transition-colors ${step === item.id ? "border-violet-500/40 bg-violet-500/10" : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"}`}
                onClick={() => setStep(item.id)}
              >
                <span className="block text-sm font-semibold">
                  <span className="mr-2 opacity-50">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.title}
                </span>
                <span className="admin-help mt-1 hidden 2xl:block">
                  {item.detail}
                </span>
              </button>
            ))}
            <Link
              to="/admin/conversions"
              className="admin-btn-ghost mt-2 justify-start"
            >
              Results <ArrowRight size={15} />
            </Link>
            <p className="admin-help hidden px-3 pt-3 xl:block">
              Drafts stay private. Publish when your offer is ready.
            </p>
          </div>
        </nav>
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <section
            aria-label="Live offer preview"
            className="admin-card order-2 min-w-0 overflow-hidden xl:order-1 xl:sticky xl:top-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-current/10 p-4">
              <div>
                <p className="font-semibold text-sm">Live preview</p>
                <p className="admin-help">
                  Your working copy · no orders or payments
                </p>
              </div>
              <div
                className="flex gap-1"
                role="group"
                aria-label="Preview device"
              >
                <button
                  type="button"
                  className="admin-btn-ghost"
                  aria-label="Desktop preview"
                  aria-pressed={device === "desktop"}
                  onClick={() => setDevice("desktop")}
                >
                  <Monitor size={17} />
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  aria-label="Phone preview"
                  aria-pressed={device === "phone"}
                  onClick={() => setDevice("phone")}
                >
                  <Smartphone size={17} />
                </button>
              </div>
            </div>
            <div className="max-h-[780px] overflow-y-auto bg-black/[0.025] p-3 dark:bg-white/[0.025]">
              <OfferBuilderPreview
                offer={previewOffer}
                builder={builder}
                stage={effectiveStage}
                device={device}
                nextOffer={external ? null : selectedNextOffer.data}
                followUpWindowMinutes={Number(form.window) || 0}
              />
            </div>
          </section>
          <div className="order-1 min-w-0 space-y-6 xl:order-2">
            <div hidden={step !== "strategy"} className="space-y-6">
              <OfferStrategyFields
                value={builder.strategy}
                onChange={(strategy) =>
                  setBuilder((old) => ({ ...old, strategy }))
                }
              />
              <OfferProofLibrary
                recoveryKey={initial?.id || "new-offer"}
                onStateChange={setEvidenceState}
                selectedIds={builder.proofIds}
                onChange={(proofIds) =>
                  setBuilder((old) => ({ ...old, proofIds }))
                }
                onInsert={insertProof}
              />
            </div>
            <div hidden={step !== "pages"} className="space-y-6">
              <div className="admin-card p-4 space-y-3">
                <label className="block text-sm font-medium">
                  Presentation
                  <select
                    className="admin-input mt-2 w-full"
                    value={effectiveStage}
                    onChange={(event) =>
                      setStage(event.target.value as PageStage)
                    }
                  >
                    <option value="landing">Landing page</option>
                    {!external && (
                      <option value="upsell">This offer as an upsell</option>
                    )}
                    {!external && (
                      <option value="thank-you">Thank-you & first step</option>
                    )}
                  </select>
                </label>
                <p className="admin-help">
                  {external
                    ? "The linked provider handles checkout and confirmation. Your local landing page is the only presentation used for this offer."
                    : "Each presentation has its own copy. The product, price and delivery remain the same."}
                </p>
              </div>
              {effectiveStage === "thank-you" ? (
                <section className="admin-card p-5 space-y-5">
                  <h2 className="text-xl font-semibold">
                    Help your customer get started
                  </h2>
                  {(
                    [
                      ["headline", "Thank-you headline", 300],
                      ["body", "Thank-you copy", 2000],
                      ["firstStep", "Their first action", 2000],
                    ] as const
                  ).map(([key, label, maxLength]) => (
                    <label key={key} className="block text-sm font-medium">
                      {label}
                      <textarea
                        rows={3}
                        maxLength={maxLength}
                        className="admin-input mt-2 w-full"
                        value={builder.presentation.thankYou[key]}
                        onChange={(event) =>
                          setBuilder((old) => ({
                            ...old,
                            presentation: {
                              ...old.presentation,
                              thankYou: {
                                ...old.presentation.thankYou,
                                [key]: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <p className="admin-help">
                    The original download stays available when a customer
                    declines a follow-up.
                  </p>
                </section>
              ) : (
                <>
                  <OfferPageFields
                    key={effectiveStage}
                    value={builder.presentation[effectiveStage]}
                    stage={effectiveStage}
                    recipeContext={{
                      strategy: builder.strategy,
                      offer: previewOffer,
                    }}
                    onChange={(page) => updatePage(page, effectiveStage)}
                  />
                  <OfferCopyAssistant
                    builder={builder}
                    offer={previewOffer}
                    savedOfferId={savedId || undefined}
                    stage={effectiveStage}
                    onApply={updatePage}
                  />
                </>
              )}
              <section className="admin-card p-5 md:p-6 space-y-5">
                <h2 className="text-lg font-semibold">
                  Product details & original description
                </h2>
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
                    rows={3}
                    maxLength={500}
                    className="admin-input mt-2 w-full"
                    placeholder="What will someone be able to do with this resource?"
                    value={form.summary}
                    onChange={(event) => update("summary", event.target.value)}
                  />
                </label>
                <p className="admin-help">
                  The original description remains available for pages without
                  structured sections. Adding sections replaces this description
                  on that presentation.
                </p>
                <label className="block text-sm font-medium">
                  Full description
                  <textarea
                    ref={bodyRef}
                    rows={10}
                    maxLength={20000}
                    className="admin-input mt-2 w-full"
                    placeholder="Explain who it is for, what is inside, and how to use it. Separate paragraphs with a blank line."
                    value={form.body}
                    onChange={(event) => update("body", event.target.value)}
                  />
                  <span className="admin-help block mt-2">
                    Plain text. Use ## before a section heading and - before
                    each bullet. Explain who it is for, what is included, and
                    the next step. For a quote, start every line with &gt;, use
                    a line with only &gt; between paragraphs, and put the author
                    in a final paragraph as &gt; — Name. Use Insert image to add
                    an image at your cursor, or put ![Image
                    description](https://… "Caption") on its own line. The
                    caption is optional. HTML is not rendered.
                    <span className="mt-2 block whitespace-pre-line font-mono text-xs">
                      {
                        "> First quote paragraph.\n>\n> Second quote paragraph.\n>\n> — Name"
                      }
                    </span>
                  </span>
                </label>
                <OfferImageInsert
                  body={form.body}
                  onChange={(body) => update("body", body)}
                  textareaRef={bodyRef}
                />
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
                    Use an HTTPS image you have permission to share. Leave blank
                    for a text-led page.
                  </span>
                </label>
              </section>
            </div>
            <OfferNextStep
              active={step === "next"}
              form={form}
              external={external}
              savedId={savedId}
              choices={choices.data}
              choicesPending={choices.isPending}
              choicesError={choices.isError}
              previewError={selectedNextOffer.isError}
              nextChoice={nextChoice}
              qualifyingParents={qualifyingParents}
              onChange={patchForm}
              onRetryChoices={() => void choices.refetch()}
              onRetryPreview={() => void selectedNextOffer.refetch()}
            />
            <OfferDeliveryStep
              active={step === "delivery"}
              form={form}
              external={external}
              dirty={dirty}
              uploading={uploading}
              fileRef={fileRef}
              health={health}
              onChange={patchForm}
              onUpload={(file) => void upload(file)}
              onCancelUpload={() => uploadController.current?.abort()}
              actionLabel={
                builder.presentation.landing.ctaText || form.externalButtonText
              }
              onActionLabelChange={(ctaText) => {
                updatePage(
                  { ...builder.presentation.landing, ctaText },
                  "landing",
                );
                // Keep the old field in step with this explicit edit, so clearing
                // the label cannot revive stale legacy wording.
                update("externalButtonText", ctaText);
              }}
            />
            <div hidden={step !== "review"} className="space-y-6">
              <section className="admin-card p-5 space-y-5">
                <div>
                  <p className="admin-eyebrow">05 · Review</p>
                  <h2 className="text-xl font-semibold">
                    Ready for your next customer?
                  </h2>
                  <p className="admin-help mt-2">
                    Publishing applies this draft’s pages, price, delivery and
                    follow-up settings together.
                  </p>
                </div>
                <div className="rounded-xl border border-current/10 p-4">
                  <p className="font-semibold text-sm">Publication checks</p>
                  {publishIssues.length ? (
                    <div className="text-amber-700 dark:text-amber-300">
                      <OfferIssueList issues={publishIssues} onGo={setStep} />
                    </div>
                  ) : (
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Check size={16} /> Required offer details are complete.
                    </p>
                  )}
                  <OfferReviewStatus
                    offer={
                      savedId && version.current
                        ? {
                            id: savedId,
                            status: savedStatus,
                            updated_at: version.current,
                            title: liveOffer.current?.title || form.title,
                          }
                        : null
                    }
                    disabled={saving || uploading}
                    onChanged={statusChanged}
                    onError={setError}
                  />
                </div>
                <OfferJourneyReadiness
                  external={external}
                  paid={form.kind === "paid"}
                  health={health}
                  onRetry={() => void health.refetch()}
                  hasFollowUp={!!form.nextOffer}
                  followUpStatus={nextChoice?.status}
                />
                <div>
                  <h3 className="font-semibold text-sm">
                    Customer decision: strengthen the argument
                  </h3>
                  <p className="admin-help mt-1">
                    Editorial suggestions, not a prediction of conversion rate.
                  </p>
                  {advice.length ? (
                    <ul className="mt-3 space-y-3">
                      {advice.map((item) => (
                        <li
                          key={`${item.title}:${item.sectionId || item.fieldId || ""}`}
                          className="rounded-lg bg-black/[0.025] p-3 dark:bg-white/[0.025]"
                        >
                          <strong className="text-sm">{item.title}</strong>
                          <p className="admin-help mt-1">{item.detail}</p>
                          <button
                            type="button"
                            className="admin-btn-ghost mt-2"
                            onClick={() => {
                              if (item.stage) setStage(item.stage);
                              setStep(item.step);
                              if (item.sectionId || item.fieldId)
                                requestAnimationFrame(() => {
                                  const field = document.getElementById(
                                    item.sectionId
                                      ? `${item.sectionId}-copy`
                                      : item.fieldId!,
                                  );
                                  const details = field?.closest("details");
                                  if (details) details.open = true;
                                  field?.scrollIntoView?.({ block: "center" });
                                  field?.focus();
                                });
                            }}
                          >
                            Review this item <ArrowRight size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-help mt-3">
                      Your brief covers the buyer, outcome, deliverables,
                      evidence and objections. Review the preview for accuracy
                      before publishing.
                    </p>
                  )}
                </div>
              </section>
              <OfferShopSettings form={form} onChange={patchForm} />
              <OfferBuilderShare
                savedId={savedId}
                savedSlug={savedSlug}
                savedStatus={savedStatus}
                savedInShop={savedInShop}
                dirty={dirty}
                funnelOnly={!external && form.funnelOnly}
                onNotice={setNotice}
              />
              <OfferRevisionHistory
                history={history}
                dirty={dirty}
                compare={revisionChanges}
                onRestore={restoreDocument}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={stepIndex === 0}
                onClick={() => setStep(workflow[stepIndex - 1].id)}
              >
                <ArrowLeft size={15} /> Back
              </button>
              {stepIndex < workflow.length - 1 && (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => setStep(workflow[stepIndex + 1].id)}
                >
                  Continue to {workflow[stepIndex + 1].title.toLowerCase()}{" "}
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </fieldset>
      <OfferConfirmDialog
        open={confirmPublish}
        title="Publish these changes?"
        description="Visitors see the new pages, price, delivery and follow-up as soon as you publish. Existing orders keep their original price and download."
        warning={
          liveOffer.current?.status === "archived"
            ? "This offer is archived. Publishing makes it public again and returns it to the Shop if Shop visibility is on."
            : undefined
        }
        changes={publishChanges}
        noChanges="Price, page URL, download file, checkout and follow-up stay the same. Your page copy and other settings will be updated."
        confirmLabel={
          liveOffer.current?.status === "archived"
            ? "Publish archived offer"
            : "Publish now"
        }
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmPublish(false)}
      />
    </div>
  );
}
