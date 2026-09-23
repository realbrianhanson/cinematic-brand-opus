import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  History,
  Loader2,
  Monitor,
  Smartphone,
  Upload,
} from "lucide-react";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  empty,
  toForm,
  slugify,
  payload,
  type Offer,
  type Form,
} from "./offerEditorState";
import { errorMessage } from "@/lib/errorMessage";
import {
  invokeOfferApi,
  type OfferHealth,
  type PublicOffer,
} from "@/lib/offers";
import {
  builderFromOffer,
  newSection,
  offerBuilderSchema,
  reviewOffer,
  type OfferBuilder,
  type OfferPage,
  type OfferProof,
} from "@/lib/offerBuilder";
import {
  loadOfferBuilder,
  saveOfferBuilder,
  type OfferBuilderLoadResult,
  type OfferBuilderDocument,
  type OfferBuilderSaveInput,
} from "@/lib/offerBuilderClient";
import QueryNotice from "./QueryNotice";
import OfferShopSettings from "./OfferShopSettings";
import OfferBuilderShare from "./offers/OfferBuilderShare";
import OfferImageInsert from "./OfferImageInsert";
import OfferStrategyFields from "./offers/OfferStrategyFields";
import OfferPageFields from "./offers/OfferPageFields";
import OfferCopyAssistant from "./offers/OfferCopyAssistant";
import OfferProofLibrary from "./offers/OfferProofLibrary";
import OfferBuilderPreview from "@/components/offers/OfferBuilderPreview";

const workflow = [
  { id: "strategy", title: "Strategy", detail: "Buyer, promise & proof" },
  { id: "pages", title: "Pages", detail: "Copy & presentation" },
  { id: "next", title: "Next step", detail: "A relevant follow-up" },
  { id: "delivery", title: "Delivery", detail: "Price, checkout & access" },
  { id: "review", title: "Review", detail: "Check, publish & share" },
] as const;
type WorkflowStep = (typeof workflow)[number]["id"];
type PageStage = "landing" | "upsell" | "thank-you";
const serialize = (form: Form, builder: OfferBuilder) =>
  JSON.stringify({ form, builder });
function offerDocument(form: Form, publish: boolean) {
  if (publish) return payload({ ...form, status: "published" });
  const untitled = !form.title.trim();
  const noSlug = !form.slug.trim();
  const noPrice = form.kind === "paid" && !form.price.trim();
  const values = payload({
    ...form,
    status: "draft",
    title: untitled ? "Untitled offer" : form.title,
    slug: noSlug ? "untitled-offer" : form.slug,
    price: noPrice ? "0.50" : form.price,
  });
  return {
    ...values,
    ...(untitled ? { title: "" } : {}),
    ...(noSlug ? { slug: "" } : {}),
    ...(noPrice ? { amount_minor: 0 } : {}),
  };
}

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
  reload,
}: {
  initial: Offer | null;
  savedBuilder: OfferBuilderLoadResult;
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() =>
    initial
      ? toForm({ ...initial, ...savedBuilder.draft?.document.offer })
      : { ...empty },
  );
  const [builder, setBuilder] = useState<OfferBuilder>(
    () => savedBuilder.draft?.document.builder || builderFromOffer(initial),
  );
  const [step, setStep] = useState<WorkflowStep>(
    initial ? "pages" : "strategy",
  );
  const [stage, setStage] = useState<PageStage>("landing");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [history, setHistory] = useState(savedBuilder.history);
  const [staleDraft, setStaleDraft] = useState(
    !!(
      initial &&
      savedBuilder.draft &&
      savedBuilder.draft.base_offer_updated_at !== initial.updated_at
    ),
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
  const baseline = useRef(serialize(form, builder));
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
  const busy = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualSlug, setManualSlug] = useState(!!initial && !!form.slug);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = serialize(form, builder) !== baseline.current;
  const external = form.checkoutMode === "external";
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
        serialize(current.current, currentBuilder.current) !==
          baseline.current &&
        !window.confirm("Leave this offer? Your unsaved changes will be lost.")
      );
    },
    enableBeforeUnload: () =>
      busy.current ||
      serialize(current.current, currentBuilder.current) !== baseline.current,
  });
  const choices = useQuery({
    queryKey: ["admin-offer-choices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id,title,status,next_offer_id")
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
    enabled: !external && form.kind === "paid",
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

  async function save(event?: FormEvent, publish = false) {
    event?.preventDefault();
    if (busy.current) return;
    setError("");
    setNotice("");
    if (staleDraft) {
      setError(
        "Choose whether to keep this draft or use the current published content before saving.",
      );
      setStep("review");
      return;
    }
    let document: OfferBuilderDocument;
    try {
      document = {
        offer: offerDocument(current.current, publish),
        builder: offerBuilderSchema.parse(currentBuilder.current),
      };
    } catch (failure) {
      setError(errorMessage(failure));
      return;
    }
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
      setHistory((old) =>
        [revision, ...old.filter((item) => item.id !== revision.id)].slice(
          0,
          30,
        ),
      );
      setNotice(
        publish
          ? "Offer published. Your new copy and settings are now live. Existing orders keep their original price and download."
          : "Draft saved privately. Your public offer has not changed.",
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-offers"] }),
        qc.invalidateQueries({ queryKey: ["admin-offer-choices"] }),
      ]);
      qc.setQueryData(["admin-offer", result.offer.id], {
        offer: result.offer,
        builderState: {
          draft: result.draft,
          history: [
            revision,
            ...history.filter((item) => item.id !== revision.id),
          ].slice(0, 30),
        },
      });
      if (!initial) {
        busy.current = false;
        navigate(`/admin/offers/${result.offer.id}/edit`, { replace: true });
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function restoreDocument(document: OfferBuilderDocument) {
    if (
      dirty &&
      !window.confirm(
        "Replace your unsaved working copy with this revision? The public page will not change.",
      )
    )
      return;
    if (!liveOffer.current) return;
    const restored = toForm({ ...liveOffer.current, ...document.offer });
    setForm(restored);
    setBuilder(document.builder);
    setNotice(
      "Revision restored to your working copy. Save a private draft or publish when ready.",
    );
    setStep("pages");
  }

  function updatePage(page: OfferPage, pageStage: "landing" | "upsell") {
    setBuilder((old) => ({
      ...old,
      presentation: { ...old.presentation, [pageStage]: page },
    }));
  }
  function insertProof(proof: OfferProof) {
    const pageStage = stage === "upsell" ? "upsell" : "landing";
    const page = builder.presentation[pageStage];
    if (page.sections.length >= 30) {
      setError(
        "This page already has 30 sections. Remove one before inserting proof.",
      );
      return;
    }
    const section = {
      ...newSection("proof"),
      heading: proof.title,
      body: proof.content,
      caption: proof.attribution,
      proofId: proof.id,
    };
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
          "File uploaded privately. Save a draft to keep it, then publish to use it for new claims. Existing orders keep their original file.",
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
  const advice = reviewOffer(builder);
  let publishProblem = "";
  try {
    payload({ ...form, status: "published" });
    offerBuilderSchema.parse(builder);
  } catch (failure) {
    publishProblem = errorMessage(failure);
  }
  const stepIndex = workflow.findIndex((item) => item.id === step);
  const nextChoice = choices.data?.find((item) => item.id === form.nextOffer);

  return (
    <form
      onSubmit={(event) => void save(event)}
      noValidate
      className="admin-page-stack"
    >
      <header className="admin-page-header">
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
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="admin-btn-secondary"
            disabled={saving || uploading}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}{" "}
            Save draft
          </button>
          {step === "review" ? (
            <button
              type="button"
              className="admin-btn-primary"
              disabled={saving || uploading || staleDraft}
              onClick={() => void save(undefined, true)}
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
        className="grid min-w-0 gap-6 xl:grid-cols-[160px_minmax(0,1fr)]"
      >
        <nav aria-label="Offer builder steps" className="min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-2 xl:sticky xl:top-5 xl:flex-col xl:overflow-visible">
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
                <span className="admin-help mt-1 hidden xl:block">
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
        <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <section
            aria-label="Live offer preview"
            className="admin-card order-2 min-w-0 overflow-hidden 2xl:order-1 2xl:sticky 2xl:top-5"
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
                stage={stage}
                device={device}
                nextOffer={external ? null : selectedNextOffer.data}
              />
            </div>
          </section>
          <div className="order-1 min-w-0 space-y-6 2xl:order-2">
            <div hidden={step !== "strategy"} className="space-y-6">
              <OfferStrategyFields
                value={builder.strategy}
                onChange={(strategy) =>
                  setBuilder((old) => ({ ...old, strategy }))
                }
              />
              <OfferProofLibrary
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
                    value={stage}
                    onChange={(event) =>
                      setStage(event.target.value as PageStage)
                    }
                  >
                    <option value="landing">Landing page</option>
                    <option value="upsell">This offer as an upsell</option>
                    <option value="thank-you">Thank-you & first step</option>
                  </select>
                </label>
                <p className="admin-help">
                  Each presentation has its own copy. The product, price and
                  delivery remain the same.
                </p>
              </div>
              {stage === "thank-you" ? (
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
                    key={stage}
                    value={builder.presentation[stage]}
                    stage={stage}
                    onChange={(page) => updatePage(page, stage)}
                  />
                  <OfferCopyAssistant
                    builder={builder}
                    offer={previewOffer}
                    stage={stage}
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
            <div hidden={step !== "next"} className="space-y-6">
              {selectedNextOffer.isError && !external && form.nextOffer && (
                <p className="admin-notice">
                  The selected follow-up preview could not be loaded.{" "}
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => void selectedNextOffer.refetch()}
                  >
                    Retry follow-up preview
                  </button>
                </p>
              )}
              <section className="admin-card p-5 space-y-4">
                <p className="admin-eyebrow">03 · Next step</p>
                <h2 className="text-xl font-semibold">
                  One useful result leads to the next
                </h2>
                <p className="admin-help">
                  Offer the extra speed, implementation help or capability your
                  buyer needs next.
                </p>
                <ol className="space-y-2 text-sm">
                  <li className="rounded-lg bg-violet-500/10 p-3">
                    1. {form.title || "Your offer"}
                  </li>
                  <li className="rounded-lg border border-current/10 p-3">
                    2. Confirmation and access to the original purchase
                  </li>
                  <li className="rounded-lg border border-current/10 p-3">
                    3.{" "}
                    {nextChoice
                      ? `${nextChoice.title} (${nextChoice.status})`
                      : "Optional follow-up offer"}
                  </li>
                </ol>
                <p className="admin-help">
                  Accept opens the follow-up checkout. Decline keeps the
                  original download available.
                </p>
              </section>
              {external ? (
                <p className="admin-notice">
                  The destination website handles the next step for external
                  offers.
                </p>
              ) : (
                <>
                  <section className="admin-card p-5 md:p-6 space-y-5">
                    <h2 className="text-lg font-semibold">
                      Offer a relevant next step
                    </h2>
                    <p className="admin-help">
                      After successful fulfillment, show an optional follow-up.
                      Visitors can decline and keep their original download. A
                      paid follow-up always requires a separate checkout.
                    </p>
                    {choices.isError && (
                      <div
                        role="alert"
                        className="admin-notice admin-notice-error"
                      >
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
                        onChange={(event) =>
                          update("nextOffer", event.target.value)
                        }
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
                            onChange={(event) =>
                              update("window", event.target.value)
                            }
                          />
                          <span className="admin-help block mt-2">
                            0 means no timer. Otherwise use 30–10,080 minutes
                            (up to seven days). The deadline starts after the
                            original order is fulfilled and does not reset on a
                            refresh.
                          </span>
                        </label>
                        <p className="admin-help">
                          The follow-up must be published to appear. Existing
                          orders keep the follow-up and time window in place
                          when they were created.
                        </p>
                      </>
                    )}
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.funnelOnly}
                        onChange={(event) =>
                          setForm((old) => ({
                            ...old,
                            funnelOnly: event.target.checked,
                            ...(event.target.checked
                              ? { showInShop: false, shopFeatured: false }
                              : {}),
                          }))
                        }
                      />
                      <span>
                        <strong>
                          Make this offer available only as a follow-up
                        </strong>
                        <span className="admin-help block mt-1">
                          Its page may be viewed, but a qualifying original
                          claim is required. Link to this offer from another
                          published offer before sharing your flow.
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
                  {nextChoice && (
                    <Link
                      to={`/admin/offers/${nextChoice.id}/edit`}
                      className="admin-btn-secondary"
                    >
                      Edit the selected follow-up <ArrowRight size={15} />
                    </Link>
                  )}
                </>
              )}
            </div>
            <div hidden={step !== "delivery"} className="space-y-6">
              <section className="admin-card p-5 md:p-6 space-y-4">
                <h2 className="text-lg font-semibold">
                  How visitors get this offer
                </h2>
                <label className="block text-sm font-medium">
                  Checkout or delivery method
                  <select
                    className="admin-input mt-2 w-full"
                    value={form.checkoutMode}
                    onChange={(event) => {
                      const checkoutMode = event.target
                        .value as Form["checkoutMode"];
                      setForm((old) => ({
                        ...old,
                        checkoutMode,
                        ...(checkoutMode === "external"
                          ? { funnelOnly: false }
                          : { priceDisplayMode: "fixed" }),
                      }));
                    }}
                  >
                    <option value="native">Website checkout / download</option>
                    <option value="external">External / affiliate link</option>
                  </select>
                </label>
                <p className="admin-help">
                  {external
                    ? "Send visitors to your sales page, a Stripe Payment Link, or another provider's product. No Stripe keys or uploaded file are needed here."
                    : "Collect an opt-in for a free download, or use your site's Stripe Checkout for a paid download. You can add a follow-up offer after delivery."}
                </p>
              </section>

              {external ? (
                <>
                  <section className="admin-card p-5 md:p-6 space-y-5">
                    <h2 className="text-lg font-semibold">
                      External destination
                    </h2>
                    <label className="block text-sm font-medium">
                      Destination URL
                      <input
                        type="url"

                        maxLength={2048}
                        className="admin-input mt-2 w-full"
                        placeholder="https://…"
                        value={form.externalUrl}
                        onChange={(event) =>
                          update("externalUrl", event.target.value)
                        }
                      />
                      <span className="admin-help block mt-2">
                        Paste the full HTTPS link, including any affiliate or
                        tracking parameters.
                      </span>
                    </label>
                    <label className="block text-sm font-medium">
                      Button label{" "}
                      <span className="admin-help">(optional)</span>
                      <input
                        maxLength={80}
                        className="admin-input mt-2 w-full"
                        placeholder="View offer"
                        value={form.externalButtonText}
                        onChange={(event) =>
                          update("externalButtonText", event.target.value)
                        }
                      />
                    </label>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.isAffiliate}
                        onChange={(event) =>
                          update("isAffiliate", event.target.checked)
                        }
                      />
                      <span>
                        <strong>This is an affiliate link</strong>
                        <span className="admin-help block mt-1">
                          Show an affiliate disclosure beside the button when
                          you may earn a commission.
                        </span>
                      </span>
                    </label>
                    {form.isAffiliate && (
                      <label className="block text-sm font-medium">
                        Affiliate disclosure{" "}
                        <span className="admin-help">(optional)</span>
                        <textarea
                          rows={3}
                          maxLength={1000}
                          className="admin-input mt-2 w-full"
                          value={form.affiliateDisclosure}
                          onChange={(event) =>
                            update("affiliateDisclosure", event.target.value)
                          }
                          placeholder="Leave blank to use the standard affiliate disclosure."
                        />
                        <span className="admin-help block mt-2">
                          Your disclosure appears beside the button. Leave this
                          blank to use the standard affiliate disclosure.
                        </span>
                      </label>
                    )}
                    <p className="admin-help">
                      Checkout, opt-ins, delivery, and any upsells happen on the
                      destination site. This listing does not create orders or
                      leads here and cannot be part of a website download
                      funnel. If an existing offer is used as a follow-up,
                      create a new external listing instead.
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <section className="admin-card p-5 md:p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Private download</h2>
                    <p className="admin-help">
                      Customers receive a download button on their confirmation
                      page. Files are private and download links are temporary.
                      Delivery email availability is checked in Offers setup.
                    </p>
                    {form.assetName && (
                      <div className="admin-notice flex items-start gap-3">
                        <FileText size={20} className="shrink-0 mt-1" />
                        <div className="min-w-0">
                          <p className="font-medium break-all">
                            {form.assetName}
                          </p>
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
                        PDF, ZIP, EPUB, TXT, or Markdown · maximum 25 MB.
                        Replacements are saved as new versions; files already
                        purchased are preserved.
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
                        onChange={(event) =>
                          update("thankYou", event.target.value)
                        }
                      />
                    </label>
                  </section>
                </>
              )}
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
                    <option value="free">
                      {external ? "Free offer" : "Free download"}
                    </option>
                    <option value="paid">
                      {external ? "Paid offer" : "Paid digital product"}
                    </option>
                  </select>
                </label>
                {form.kind === "paid" && (
                  <>
                    {external && (
                      <label className="block text-sm font-medium">
                        Price shown in Shop
                        <select
                          className="admin-input mt-2 w-full"
                          value={form.priceDisplayMode}
                          onChange={(event) =>
                            update(
                              "priceDisplayMode",
                              event.target.value as Form["priceDisplayMode"],
                            )
                          }
                        >
                          <option value="fixed">Show a specific price</option>
                          <option value="provider">
                            View current pricing on destination
                          </option>
                        </select>
                        <span className="admin-help block mt-2">
                          Use current pricing for subscriptions, changing
                          promotions, or products with several plans.
                        </span>
                      </label>
                    )}
                    {(!external || form.priceDisplayMode === "fixed") && (
                      <div className="grid grid-cols-[1fr_100px] gap-3">
                        <label className="block text-sm font-medium">
                          Price
                          <input
                            required
                            inputMode="decimal"
                            className="admin-input mt-2 w-full"
                            placeholder="19.00"
                            value={form.price}
                            onChange={(event) =>
                              update("price", event.target.value)
                            }
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
                            {["usd", "cad", "eur", "gbp", "aud"].map(
                              (currency) => (
                                <option key={currency} value={currency}>
                                  {currency.toUpperCase()}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                    )}
                    <p className="admin-help">
                      {external
                        ? form.priceDisplayMode === "provider"
                          ? "The Shop shows “View current pricing”. Visitors confirm the price and terms on the destination site."
                          : "This is a display price. Keep it in sync with the destination; checkout and final terms are handled there."
                        : "One-time payment through Stripe Checkout. Price is stored exactly to the cent; no recurring or automatic charges."}
                    </p>
                    {!external && (
                      <div className="admin-notice text-sm">
                        {health.isPending
                          ? "Checking payment and download-email setup…"
                          : health.isError
                            ? "Checkout readiness is unknown. Check payment and download-email setup before sharing a paid offer."
                            : health.data?.payments_ready
                              ? `Stripe ${health.data.mode} and download-email configuration are present. A real checkout or email delivery has not been verified by this check.`
                              : "You can save or publish this page now. Checkout stays unavailable until Stripe and download-email setup are complete."}
                        <Link
                          to="/admin/offers?tab=setup"
                          className="underline block mt-2"
                        >
                          Offers setup
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
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
                  {publishProblem ? (
                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                      {publishProblem}
                    </p>
                  ) : (
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Check size={16} /> Required offer details are complete.
                    </p>
                  )}
                  {!external &&
                    form.kind === "paid" &&
                    !health.data?.payments_ready && (
                      <p className="admin-help mt-2">
                        Checkout setup is not verified. Complete payment and
                        download-email setup before sharing a paid offer.
                      </p>
                    )}
                  {form.nextOffer && nextChoice?.status !== "published" && (
                    <p className="admin-help mt-2">
                      Your selected follow-up is not published, so it will not
                      appear for visitors.
                    </p>
                  )}
                  <p className="admin-help mt-2">
                    Public status: {savedStatus}. Archiving is available from
                    All offers.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    Strengthen the argument
                  </h3>
                  <p className="admin-help mt-1">
                    Editorial suggestions, not a prediction of conversion rate.
                  </p>
                  {advice.length ? (
                    <ul className="mt-3 space-y-3">
                      {advice.map((item) => (
                        <li
                          key={item.title}
                          className="rounded-lg bg-black/[0.025] p-3 dark:bg-white/[0.025]"
                        >
                          <strong className="text-sm">{item.title}</strong>
                          <p className="admin-help mt-1">{item.detail}</p>
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
              <OfferShopSettings
                form={form}
                onChange={(changes) =>
                  setForm((old) => ({ ...old, ...changes }))
                }
              />
              <OfferBuilderShare
                savedId={savedId}
                savedSlug={savedSlug}
                savedStatus={savedStatus}
                savedInShop={savedInShop}
                dirty={dirty}
                funnelOnly={!external && form.funnelOnly}
                onNotice={setNotice}
              />
              <section className="admin-card p-5 space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <History size={18} /> Saved revisions
                </h2>
                <p className="admin-help">
                  Restore a revision into your working copy. The public page
                  changes only when you publish.
                </p>
                {history.length ? (
                  <ul className="space-y-3">
                    {history.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-current/10 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            Revision {item.version} ·{" "}
                            {item.published ? "Published" : "Draft"}
                          </p>
                          <time
                            className="admin-help"
                            dateTime={item.created_at}
                          >
                            {new Date(item.created_at).toLocaleString()}
                          </time>
                        </div>
                        <button
                          type="button"
                          className="admin-btn-secondary"
                          onClick={() => restoreDocument(item.document)}
                        >
                          Restore revision {item.version}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-help">
                    Your first saved draft starts the revision history.
                  </p>
                )}
              </section>
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
    </form>
  );
}
