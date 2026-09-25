import { seoDocumentSchema } from "@/lib/contentDocument";
import type { Json, Tables } from "@/integrations/supabase/types";
import { z } from "zod";
import { errorMessage, isErrorCode } from "@/lib/errorMessage";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAdminDraftGuard } from "./useAdminDraftGuard";
import { useLocalEditorRecovery } from "@/hooks/useLocalEditorRecovery";
import LocalDraftRecoveryBanner from "./LocalDraftRecoveryBanner";
import SavedVersionHistory from "./SavedVersionHistory";
import { asEditorialRecord } from "@/lib/editorialHistory";
import { useParams, useNavigate } from "@/lib/router-compat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import {
  hasFaqItems,
  validateGeneratedContent,
} from "@/lib/generatedContentValidation";
import {
  friendlyPublishError,
  PUBLISH_SCORE_THRESHOLD,
  validateResourceSlug,
  validateResourceTitle,
} from "@/lib/resourcePages";
import { slugifyTitle } from "../../../supabase/functions/_shared/voice";
import { invokeAdminFunction } from "./manualPublishClient";
import {
  ConfirmDialog,
  QualityWarningDialog,
  SeoHelperCard,
  type SeoCriterion,
} from "./GeneratedPageEditorParts";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Wand2,
  Eye,
} from "lucide-react";

/** Refresh runs take 65-116 s (generation_logs); leave headroom. */
const REFRESH_TIMEOUT_MS = 180_000;
// These two checklist items describe the content, which the SEO endpoint
// cannot change; never ask it to "fix" them.
const CONTENT_CRITERIA = ["Content has FAQ items", "Content has intro section"];

const seoFormSchema = z
  .object({
    title: z.string().catch(""),
    description: z.string().catch(""),
    keywords: z.array(z.string()).catch([]),
    og_image: z.string().catch(""),
  })
  .catch({ title: "", description: "", keywords: [], og_image: "" });

const bodyError = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === "string" && body.error.trim() ? body.error : fallback;
const resourceRecoverySchema = z
  .object({
    title: z.string(),
    slug: z.string(),
    contentStr: z.string(),
    ogImage: z.string(),
    status: z.string(),
    metaTitle: z.string(),
    metaDesc: z.string(),
    metaKeywords: z.string(),
    seoBase: z.record(z.unknown()).default({}),
  })
  .strict();

type ScoreResult = { score: number; issues: string[] };

async function scoreOnServer(
  pageId: string,
  preview?: { content_json: unknown; title: string },
): Promise<ScoreResult> {
  const { status, body } = await invokeAdminFunction("score-content-quality", {
    page_id: pageId,
    ...(preview ?? {}),
  });
  if (status !== 200)
    throw new Error(bodyError(body, "The quality check could not run."));
  const score = Number(body.score);
  if (!Number.isFinite(score))
    throw new Error("The quality check returned no score.");
  const issues = Array.isArray(body.issues)
    ? body.issues.filter((i): i is string => typeof i === "string")
    : [];
  return { score, issues };
}

type SaveOutcome =
  | { kind: "saved"; scoreWarning: string | null }
  | { kind: "published" }
  | { kind: "needs_override"; score: number; issues: string[] };

type SavedBaseline = Pick<
  Tables<"generated_pages">,
  | "id"
  | "updated_at"
  | "title"
  | "slug"
  | "status"
  | "content_json"
  | "seo_meta"
>;
const BASELINE_COLUMNS =
  "id,updated_at,title,slug,status,content_json,seo_meta";
const SAVE_CONFLICT =
  "This resource was not saved because its saved version changed, it was deleted, or your access changed. Your edits are still here. Copy any edits you want to keep before loading the latest saved version.";

/** JSONB does not preserve object-key order; compare values, not serialization order. */
function comparableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(comparableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${comparableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function parseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null };
  } catch {
    return { value: null, error: "Invalid JSON: fix the syntax first." };
  }
}

const GeneratedPageEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [contentStr, setContentStr] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [generatingOg, setGeneratingOg] = useState(false);
  const [status, setStatus] = useState("draft");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [seoBase, setSeoBase] = useState<Record<string, unknown>>({});
  const [seoOpen, setSeoOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [previewScore, setPreviewScore] = useState<ScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [qualityWarning, setQualityWarning] = useState<ScoreResult | null>(
    null,
  );
  const [aiGenerating, setAiGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const hydratedId = useRef<string | null>(null);
  const baseline = useRef<SavedBaseline | null>(null);
  const [hydrationEpoch, setHydrationEpoch] = useState(0);
  const draftSnapshot = {
    title,
    slug,
    contentStr,
    ogImage,
    status,
    metaTitle,
    metaDesc,
    metaKeywords,
    seoBase,
  };
  const lastSubmittedDraft = useRef(draftSnapshot);
  const { markSaved } = useAdminDraftGuard(
    draftSnapshot,
    `resource:${id ?? "new"}`,
  );

  const { data: page, isLoading } = useQuery({
    queryKey: ["admin-generated-page", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select(
          "*, niches!generated_pages_niche_id_fkey(name, slug), content_schemas(name, slug)",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Background refetches can include another editor's newer stored version.
  // Only initial navigation or our explicitly confirmed regeneration may
  // replace the fields the administrator is currently editing.
  useEffect(() => {
    if (!page) return;
    if (hydratedId.current === page.id) return;
    hydratedId.current = page.id;
    baseline.current = page;
    setTitle(page.title);
    setSlug(page.slug);
    setContentStr(JSON.stringify(page.content_json, null, 2));
    setStatus(page.status ?? "draft");
    setPreviewScore(null);
    setValidationErrors([]);
    const seo = seoFormSchema.parse(page.seo_meta);
    const fullSeo = asEditorialRecord(page.seo_meta);
    setSeoBase(fullSeo);
    setMetaTitle(seo.title || "");
    setMetaDesc(seo.description || "");
    setMetaKeywords(seo.keywords.join(", "));
    setOgImage(seo.og_image || "");
    const loadedDraft = {
      title: page.title,
      slug: page.slug,
      contentStr: JSON.stringify(page.content_json, null, 2),
      ogImage: seo.og_image || "",
      status: page.status ?? "draft",
      metaTitle: seo.title || "",
      metaDesc: seo.description || "",
      metaKeywords: seo.keywords.join(", "),
      seoBase: fullSeo,
    };
    lastSubmittedDraft.current = loadedDraft;
    markSaved(loadedDraft);
    if (seo.title || seo.description || seo.keywords.length > 0)
      setHasGenerated(true);
  }, [page, hydrationEpoch, markSaved]);

  const recovery = useLocalEditorRecovery({
    documentKey: `resource:${id ?? "new"}`,
    snapshot: draftSnapshot,
    ready: !!page && page.id === id && hydratedId.current === id,
    serverVersion: page?.updated_at,
    schema: resourceRecoverySchema,
    onRestore: (draft) => {
      setTitle(draft.title);
      setSlug(
        baseline.current?.status === "published"
          ? baseline.current.slug
          : draft.slug,
      );
      setContentStr(draft.contentStr);
      setOgImage(draft.ogImage);
      setStatus(draft.status);
      setMetaTitle(draft.metaTitle);
      setMetaDesc(draft.metaDesc);
      setMetaKeywords(draft.metaKeywords);
      setSeoBase(
        draft.seoBase ?? asEditorialRecord(baseline.current?.seo_meta),
      );
      setPreviewScore(null);
      setValidationErrors([]);
      setQualityWarning(null);
    },
  });

  const isPublished = baseline.current?.status === "published";
  const storedVersionChanged = !!(
    page &&
    baseline.current &&
    page.updated_at !== baseline.current.updated_at
  );
  const schemaSlug = page?.content_schemas?.slug ?? "";
  const contentDirty =
    !!page && contentStr !== JSON.stringify(page.content_json, null, 2);
  const titleDirty = !!page && title.trim() !== page.title;
  const titleCheck = validateResourceTitle(title);
  const slugError = isPublished ? null : validateResourceSlug(slug);

  // Formatting completeness only; not a ranking prediction.
  const seoCriteria = useMemo<SeoCriterion[]>(() => {
    const parsed = parseJson(contentStr).value as Record<
      string,
      unknown
    > | null;
    const words = parsed
      ? JSON.stringify(parsed)
          .replace(/[{}[\]":,]/g, " ")
          .split(/\s+/)
          .filter(Boolean).length
      : 0;
    const kwCount = metaKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean).length;
    return [
      {
        label: "Meta title (under 60 chars)",
        done: metaTitle.length > 0 && metaTitle.length <= 60,
        points: "+20",
      },
      {
        label: "Meta description (under 160 chars)",
        done: metaDesc.length > 0 && metaDesc.length <= 160,
        points: "+20",
      },
      { label: "At least 3 keywords", done: kwCount >= 3, points: "+15" },
      {
        label: "Content is present (review depth manually)",
        done: words > 0,
        points: "+15",
      },
      {
        label: "Descriptive title present",
        done: title.trim().length > 0,
        points: "+10",
      },
      {
        label: "Content has FAQ items",
        done: hasFaqItems(parsed),
        points: "+10",
      },
      {
        label: "Content has intro section",
        done: !!(parsed?.intro || parsed?.introduction || parsed?.description),
        points: "+10",
      },
    ];
  }, [metaTitle, metaDesc, metaKeywords, contentStr, title]);
  const seoScore = seoCriteria.reduce(
    (sum, c) => sum + (c.done ? Number(c.points.slice(1)) : 0),
    0,
  );

  const introExcerpt = () => {
    const parsed = parseJson(contentStr).value as Record<
      string,
      unknown
    > | null;
    const text = parsed?.intro ?? parsed?.description;
    return typeof text === "string" ? text : "";
  };

  const runSeo = async (enhance: boolean) => {
    const setBusy = enhance ? setEnhancing : setAiGenerating;
    setBusy(true);
    try {
      const missing = seoCriteria
        .filter((c) => !c.done && !CONTENT_CRITERIA.includes(c.label))
        .map((c) => c.label);
      const { data, error } = await supabase.functions.invoke(
        "generate-seo-aeo",
        {
          body: {
            title,
            content: contentStr.slice(0, 4000),
            excerpt: introExcerpt(),
            ...(enhance ? { enhance: true, missing_criteria: missing } : {}),
          },
        },
      );
      if (error) throw error;
      if (data?.meta_title) setMetaTitle(data.meta_title);
      if (data?.meta_description) setMetaDesc(data.meta_description);
      if (data?.keywords) setMetaKeywords(data.keywords);
      setHasGenerated(true);
      setSeoOpen(true);
      toast({ title: enhance ? "SEO enhanced!" : "SEO fields generated!" });
    } catch (e) {
      toast({
        title: enhance ? "Enhancement failed" : "Generation failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  /** Parse and shape-check the JSON box; returns null and shows why if bad. */
  const readContent = (): Record<string, unknown> | null => {
    const { value, error } = parseJson(contentStr);
    const errors = error
      ? [error]
      : validateGeneratedContent(value, schemaSlug).errors;
    setValidationErrors(errors);
    return errors.length ? null : (value as Record<string, unknown>);
  };

  const assertCurrentBaseline = () => {
    const saved = baseline.current;
    const latest = qc.getQueryData<SavedBaseline>(["admin-generated-page", id]);
    if (
      !saved?.updated_at ||
      saved.id !== id ||
      (latest && latest.updated_at !== saved.updated_at)
    )
      throw new Error(SAVE_CONFLICT);
    return saved;
  };

  const adoptBaseline = (saved: SavedBaseline) => {
    baseline.current = saved;
    qc.setQueryData(["admin-generated-page", id], (previous: unknown) => ({
      ...(previous && typeof previous === "object" ? previous : {}),
      ...saved,
    }));
  };

  // Scoring and image generation write on the server and bump updated_at.
  // Only adopt their new version when all other editable fields still match;
  // otherwise a remote edit must never become our new save baseline.
  const syncServerWrite = async (allowOgImage = false) => {
    const expected = baseline.current;
    if (!expected) throw new Error(SAVE_CONFLICT);
    const { data: saved, error } = await supabase
      .from("generated_pages")
      .select(BASELINE_COLUMNS)
      .eq("id", id!)
      .maybeSingle();
    if (error) throw error;
    if (!saved?.updated_at) throw new Error(SAVE_CONFLICT);
    const comparableSeo = (value: Json | null) => {
      if (
        !allowOgImage ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      )
        return comparableJson(value);
      const { og_image: ignored, ...rest } = value;
      return comparableJson(rest);
    };
    if (
      saved.title !== expected.title ||
      saved.slug !== expected.slug ||
      saved.status !== expected.status ||
      comparableJson(saved.content_json) !==
        comparableJson(expected.content_json) ||
      comparableSeo(saved.seo_meta) !== comparableSeo(expected.seo_meta)
    )
      throw new Error(SAVE_CONFLICT);
    adoptBaseline(saved);
    return saved;
  };

  const updatePage = async (fields: Record<string, unknown>) => {
    const expected = assertCurrentBaseline();
    const { data: saved, error } = await supabase
      .from("generated_pages")
      .update(fields as never)
      .eq("id", id!)
      .eq("updated_at", expected.updated_at!)
      .select(BASELINE_COLUMNS)
      .maybeSingle();
    if (!error) {
      if (!saved?.updated_at) throw new Error(SAVE_CONFLICT);
      adoptBaseline(saved);
      return;
    }
    if (isErrorCode(error, "23505"))
      throw new Error("That URL slug is already used by another resource.");
    throw new Error(friendlyPublishError(errorMessage(error)));
  };

  const afterPublish = () => {
    if (!id) return;
    supabase.functions
      .invoke("build-silo-links", { body: { page_id: id } })
      .catch(() => {});
    supabase.functions
      .invoke("generate-og-image", { body: { page_id: id } })
      .catch(() => {});
    if (schemaSlug && page?.slug)
      supabase.functions
        .invoke("submit-indexnow", {
          body: { urls: [`/resources/${schemaSlug}/${page.slug}`] },
        })
        .catch(() => {});
  };

  const publishWithOverride = async (reason: string): Promise<SaveOutcome> => {
    const { data: auth } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    await updatePage({
      status: "published",
      published_at: now,
      publish_override: true,
      publish_override_reason: reason,
      publish_override_at: now,
      publish_override_by: auth?.user?.id ?? null,
    });
    afterPublish();
    return { kind: "published" };
  };

  /**
   * Save edits, then let the server score the saved copy. A publish happens
   * only after that score passes; the client never writes quality_score.
   */
  const saveEdits = async (
    content: Record<string, unknown>,
  ): Promise<SaveOutcome> => {
    const publishing = status === "published" && !isPublished;
    const cleanTitle = title.trim();
    const seoMeta = {
      ...seoBase,
      title: metaTitle || null,
      meta_title: metaTitle || null,
      description: metaDesc || null,
      meta_description: metaDesc || null,
      keywords: metaKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      og_image: ogImage || null,
    };
    await updatePage({
      title: cleanTitle,
      ...(isPublished ? {} : { slug: slug.trim() }),
      content_json: { ...content, title: cleanTitle } as Json,
      seo_meta: seoMeta,
      human_edited: true,
      ...(publishing ? {} : { status }),
    });

    if (!publishing) {
      try {
        await scoreOnServer(id!);
        await syncServerWrite();
        return { kind: "saved", scoreWarning: null };
      } catch (e) {
        return { kind: "saved", scoreWarning: errorMessage(e) };
      }
    }
    const scored = await scoreOnServer(id!);
    await syncServerWrite();
    if (scored.score < PUBLISH_SCORE_THRESHOLD)
      return { kind: "needs_override", ...scored };
    await updatePage({
      status: "published",
      published_at: new Date().toISOString(),
    });
    afterPublish();
    return { kind: "published" };
  };

  const saveMutation = useMutation({
    mutationFn: (vars: {
      content?: Record<string, unknown>;
      overrideReason?: string;
    }) =>
      safeMutation(async () => {
        const submitted = vars.overrideReason
          ? lastSubmittedDraft.current
          : draftSnapshot;
        const outcome = await (vars.overrideReason
          ? publishWithOverride(vars.overrideReason)
          : saveEdits(vars.content ?? {}));
        lastSubmittedDraft.current = submitted;
        return { outcome, submitted };
      }, 45_000),
    onSuccess: ({ outcome, submitted }) => {
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      qc.invalidateQueries({ queryKey: ["admin-generated-page", id] });
      if (outcome.kind === "needs_override") {
        setQualityWarning({ score: outcome.score, issues: outcome.issues });
        return;
      }
      markSaved(submitted);
      recovery.clearSaved(submitted);
      setQualityWarning(null);
      if (outcome.kind === "saved" && outcome.scoreWarning)
        toast({
          title: "Saved, but not re-scored",
          description: outcome.scoreWarning,
          variant: "destructive",
        });
      else
        toast({
          title: outcome.kind === "published" ? "Published!" : "Saved!",
        });
      navigate("/admin/pages");
    },
    onError: (e) => {
      toast({
        title: "Save failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (titleCheck.error || slugError) {
      setValidationErrors(
        [titleCheck.error, slugError].filter((e): e is string => !!e),
      );
      return;
    }
    const content = readContent();
    if (!content) return;
    saveMutation.mutate({ content });
  };

  const handleFormat = () => {
    const { value, error } = parseJson(contentStr);
    if (error) {
      toast({
        title: "Invalid JSON",
        description: "Fix JSON syntax before formatting.",
        variant: "destructive",
      });
      return;
    }
    setContentStr(JSON.stringify(value, null, 2));
  };

  // Scores what is on screen without storing it (the stored score only
  // changes when the saved copy is scored).
  const handlePreviewScore = async () => {
    const content = readContent();
    if (!content || !id) return;
    setScoring(true);
    try {
      const result = await scoreOnServer(id, {
        content_json: content,
        title: title.trim(),
      });
      setPreviewScore(result);
      toast({
        title: `Score: ${result.score}/100`,
        description: result.issues.slice(0, 3).join("; ") || undefined,
        variant:
          result.score >= PUBLISH_SCORE_THRESHOLD ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Scoring failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setScoring(false);
    }
  };

  const regenerateMutation = useMutation({
    mutationFn: () =>
      safeMutation(async () => {
        assertCurrentBaseline();
        const { status: code, body } = await invokeAdminFunction(
          "refresh-stale-content",
          { page_id: id },
        );
        if (code !== 200)
          throw new Error(bodyError(body, "The refresh could not run."));
        if (body.refreshed !== 1)
          throw new Error(
            Number(body.failed) > 0
              ? "The refresh failed. See Recent Generation Runs for the reason."
              : bodyError(body, "Nothing was refreshed."),
          );
      }, REFRESH_TIMEOUT_MS),
    onSuccess: async () => {
      setConfirmRegenerate(false);
      hydratedId.current = null;
      await qc.invalidateQueries({ queryKey: ["admin-generated-page", id] });
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      toast({
        title: "Content refreshed",
        description:
          "The page was rewritten with fresh research and re-scored.",
      });
    },
    onError: (e) => {
      setConfirmRegenerate(false);
      toast({
        title: "Refresh failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    },
  });

  const handleGenerateOg = async () => {
    setGeneratingOg(true);
    try {
      assertCurrentBaseline();
      const { data, error } = await supabase.functions.invoke(
        "generate-og-image",
        { body: { page_id: id } },
      );
      if (error || data?.error) throw new Error(error?.message || data?.error);
      const updated = await syncServerWrite(true);
      setOgImage(seoDocumentSchema.parse(updated?.seo_meta).og_image || "");
      toast({ title: "OG image generated!" });
    } catch (e) {
      toast({
        title: "Failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setGeneratingOg(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 64 }}>
        <Loader2
          size={24}
          className="animate-spin"
          aria-label="Loading"
          style={{ color: "hsl(var(--admin-accent))" }}
        />
      </div>
    );
  }

  if (!page) {
    return (
      <div style={{ padding: 64, textAlign: "center" }}>
        <p
          className="font-body"
          style={{ color: "hsl(var(--admin-text-ghost))" }}
        >
          Page not found.
        </p>
      </div>
    );
  }

  const niche = page.niches;
  const schema = page.content_schemas;
  const previewUrl = `/resources/${schemaSlug || "page"}/${page.slug}`;
  const storedScore =
    page.quality_score != null ? Number(page.quality_score) : null;
  const scoreStale = contentDirty || titleDirty || storedScore == null;

  return (
    <div>
      <LocalDraftRecoveryBanner
        recovery={recovery}
        disabled={
          saveMutation.isPending ||
          regenerateMutation.isPending ||
          aiGenerating ||
          enhancing ||
          generatingOg ||
          scoring
        }
      />
      <SavedVersionHistory
        kind="resource"
        documentId={id}
        disabled={
          saveMutation.isPending ||
          regenerateMutation.isPending ||
          aiGenerating ||
          enhancing ||
          generatingOg ||
          scoring
        }
        current={{
          title,
          content_json: parseJson(contentStr).value,
          seo_meta: {
            ...seoBase,
            title: metaTitle,
            description: metaDesc,
            keywords: metaKeywords,
            og_image: ogImage,
          },
        }}
        onLoad={(version) => {
          if (typeof version.content === "string") return;
          setTitle(version.title);
          setContentStr(JSON.stringify(version.content, null, 2));
          setSeoBase(version.seoMeta);
          const seo = seoFormSchema.parse(version.seoMeta);
          setMetaTitle(seo.title || String(version.seoMeta.meta_title ?? ""));
          setMetaDesc(
            seo.description || String(version.seoMeta.meta_description ?? ""),
          );
          setMetaKeywords(seo.keywords.join(", "));
          setOgImage(seo.og_image || "");
          setPreviewScore(null);
          setValidationErrors([]);
          setQualityWarning(null);
        }}
      />
      {storedVersionChanged && (
        <div role="alert" className="admin-card mb-5 p-4">
          <p>
            This resource changed in another window. Your edits are still here,
            but saving is blocked to protect the newer saved version.
          </p>
          <button
            type="button"
            className="admin-btn-secondary mt-3"
            onClick={() => {
              if (
                !window.confirm(
                  "Load the latest saved version? Your unsaved edits will be discarded. Copy anything you want to keep first.",
                )
              )
                return;
              hydratedId.current = null;
              setQualityWarning(null);
              setHydrationEpoch((value) => value + 1);
            }}
          >
            Load latest saved version
          </button>
        </div>
      )}
      {qualityWarning && (
        <QualityWarningDialog
          score={qualityWarning.score}
          issues={qualityWarning.issues}
          busy={saveMutation.isPending}
          onBackToDraft={() => {
            setQualityWarning(null);
            setStatus(page.status ?? "draft");
          }}
          onPublishAnyway={(reason) =>
            saveMutation.mutate({ overrideReason: reason })
          }
        />
      )}
      {confirmRegenerate && (
        <ConfirmDialog
          id="regenerate-title"
          title="Rewrite this page with fresh research?"
          body={`The current content${contentDirty ? ", your unsaved edits," : ""} and any manual edits are replaced. The title intent and URL stay the same. It takes 1–2 minutes and uses AI and research credits.`}
          confirmLabel="Rewrite content"
          busyLabel="Rewriting..."
          busy={regenerateMutation.isPending}
          onConfirm={() => regenerateMutation.mutate()}
          onCancel={() => setConfirmRegenerate(false)}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-4"
        style={{ marginBottom: 24 }}
      >
        <h1
          className="font-heading italic"
          style={{ fontSize: 28, fontWeight: 400 }}
        >
          Edit Page
        </h1>
        <div className="flex gap-3">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn-ghost flex items-center gap-2"
          >
            <Eye size={14} aria-hidden />
            {isPublished ? "View live page" : "Preview draft"}
          </a>
          <button
            onClick={() => navigate("/admin/pages")}
            className="admin-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="admin-btn-primary"
          >
            {saveMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div
          role="alert"
          className="admin-card font-body"
          style={{
            padding: 16,
            marginBottom: 20,
            border: "1px solid hsl(var(--admin-danger) / 0.4)",
            color: "hsl(var(--admin-text))",
            fontSize: 13,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Not saved. Fix these first:
          </p>
          <ul style={{ paddingLeft: 16 }}>
            {validationErrors.slice(0, 12).map((e) => (
              <li key={e} style={{ listStyle: "disc" }}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Title + slug */}
          <div
            className="admin-card flex flex-col gap-3"
            style={{ padding: 20 }}
          >
            <div>
              <label htmlFor="page-title" className="admin-label">
                Title
              </label>
              <input
                id="page-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="admin-input font-body w-full"
                style={{ fontSize: 16 }}
              />
              <span
                className="font-body"
                style={{
                  fontSize: 10,
                  color:
                    title.trim().length > 70
                      ? "hsl(var(--admin-danger))"
                      : "hsl(var(--admin-text-ghost))",
                }}
              >
                {title.trim().length}/70
              </span>
              {titleCheck.warnings.map((w) => (
                <p
                  key={w}
                  className="font-body"
                  style={{ fontSize: 11, color: "hsl(var(--admin-danger))" }}
                >
                  {w} (costs 30 quality points)
                </p>
              ))}
            </div>
            <div>
              <label htmlFor="page-slug" className="admin-label">
                URL slug
              </label>
              <div className="flex gap-2">
                <input
                  id="page-slug"
                  value={slug}
                  readOnly={isPublished}
                  aria-describedby="page-slug-help"
                  onChange={(e) => setSlug(e.target.value)}
                  className="admin-input font-body w-full"
                />
                {!isPublished && (
                  <button
                    type="button"
                    onClick={() => setSlug(slugifyTitle(title))}
                    className="admin-btn-ghost whitespace-nowrap"
                    style={{ fontSize: 11 }}
                  >
                    From title
                  </button>
                )}
              </div>
              <p
                id="page-slug-help"
                className="font-body"
                style={{
                  fontSize: 11,
                  color: slugError
                    ? "hsl(var(--admin-danger))"
                    : "hsl(var(--admin-text-ghost))",
                }}
              >
                {isPublished
                  ? "Published pages keep their URL so existing links keep working."
                  : (slugError ?? `/resources/${schemaSlug}/${slug}`)}
              </p>
            </div>
          </div>

          {/* JSON editor */}
          <div>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 8 }}
            >
              <label
                htmlFor="page-content"
                className="admin-label"
                style={{ marginBottom: 0 }}
              >
                Content JSON
              </label>
              <button
                onClick={handleFormat}
                className="admin-btn-ghost"
                style={{ fontSize: 11, padding: "4px 12px" }}
              >
                Format JSON
              </button>
            </div>
            <textarea
              id="page-content"
              value={contentStr}
              onChange={(e) => setContentStr(e.target.value)}
              className="font-body w-full"
              spellCheck={false}
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 1.6,
                minHeight: 500,
                padding: 20,
                borderRadius: 6,
                border: "1px solid hsl(var(--admin-border))",
                backgroundColor: "hsl(var(--admin-surface-2))",
                color: "hsl(var(--admin-text))",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Status */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label htmlFor="page-status" className="admin-label">
              Status
            </label>
            <select
              id="page-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="admin-input font-body w-full"
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            {status === "published" && !isPublished && (
              <p
                className="font-body"
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  color: "hsl(var(--admin-text-ghost))",
                }}
              >
                Saving scores the page first; it publishes at{" "}
                {PUBLISH_SCORE_THRESHOLD}+ or with an override reason.
              </p>
            )}
          </div>

          <SeoHelperCard
            score={seoScore}
            criteria={seoCriteria}
            hasGenerated={hasGenerated}
            aiGenerating={aiGenerating}
            enhancing={enhancing}
            onGenerate={() => runSeo(false)}
            onEnhance={() => runSeo(true)}
          />

          {/* Quality score (server-owned) */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 8 }}
            >
              <span className="admin-label" style={{ marginBottom: 0 }}>
                Quality Score
              </span>
              <button
                onClick={handlePreviewScore}
                disabled={scoring}
                className="admin-btn-ghost"
                style={{ fontSize: 10, padding: "2px 8px" }}
              >
                {scoring ? (
                  <Loader2
                    size={12}
                    className="animate-spin"
                    aria-label="Scoring"
                  />
                ) : (
                  "Check score"
                )}
              </button>
            </div>
            <p
              data-testid="quality-score"
              className="font-heading"
              style={{
                fontSize: 22,
                color:
                  storedScore != null && storedScore >= PUBLISH_SCORE_THRESHOLD
                    ? "hsl(var(--admin-sage))"
                    : "hsl(var(--admin-text))",
              }}
            >
              {storedScore != null ? storedScore.toFixed(1) : "—"}
              <span
                className="font-body"
                style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}
              >
                {" "}
                / 100 saved
              </span>
            </p>
            <p
              className="font-body"
              style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}
            >
              {scoreStale
                ? "Not scored since your last edit. Saving re-scores it."
                : "Set by the scoring service; it cannot be typed in."}
            </p>
            {previewScore && (
              <p
                className="font-body"
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  color: "hsl(var(--admin-text-soft))",
                }}
              >
                On-screen version: {previewScore.score}/100 (not saved)
              </p>
            )}
          </div>

          {/* Info */}
          <div className="admin-card" style={{ padding: 20 }}>
            <span className="admin-label" style={{ marginBottom: 12 }}>
              Info
            </span>
            <div className="flex flex-col gap-2">
              {[
                ["Niche", niche?.name || "—"],
                ["Content Type", schema?.name || "—"],
                ["Model", page.generation_model || "—"],
                [
                  "Cost",
                  page.generation_cost != null
                    ? `$${Number(page.generation_cost).toFixed(4)}`
                    : "—",
                ],
                [
                  "Created",
                  page.created_at
                    ? new Date(page.created_at).toLocaleDateString()
                    : "—",
                ],
                [
                  "Last Refreshed",
                  page.last_refreshed
                    ? new Date(page.last_refreshed).toLocaleDateString()
                    : "—",
                ],
                ["Refresh Count", String(page.refresh_count ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span
                    className="font-body"
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--admin-text-ghost))",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="font-body"
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--admin-text-soft))",
                      fontWeight: 500,
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SEO */}
          <div className="admin-card" style={{ padding: 20 }}>
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              aria-expanded={seoOpen}
              className="flex items-center justify-between w-full"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span className="admin-label" style={{ marginBottom: 0 }}>
                SEO Meta
              </span>
              {seoOpen ? (
                <ChevronUp
                  size={14}
                  aria-hidden
                  style={{ color: "hsl(var(--admin-text-ghost))" }}
                />
              ) : (
                <ChevronDown
                  size={14}
                  aria-hidden
                  style={{ color: "hsl(var(--admin-text-ghost))" }}
                />
              )}
            </button>
            {seoOpen && (
              <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
                <div>
                  <label
                    htmlFor="seo-title"
                    className="admin-label"
                    style={{ fontSize: 10 }}
                  >
                    Meta Title
                  </label>
                  <input
                    id="seo-title"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    className="admin-input font-body w-full"
                  />
                  <span
                    className="font-body"
                    style={{
                      fontSize: 10,
                      color:
                        metaTitle.length > 60
                          ? "hsl(var(--admin-danger))"
                          : "hsl(var(--admin-text-ghost))",
                    }}
                  >
                    {metaTitle.length}/60
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="seo-description"
                    className="admin-label"
                    style={{ fontSize: 10 }}
                  >
                    Meta Description
                  </label>
                  <textarea
                    id="seo-description"
                    value={metaDesc}
                    onChange={(e) => setMetaDesc(e.target.value)}
                    className="admin-input font-body w-full"
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                  <span
                    className="font-body"
                    style={{
                      fontSize: 10,
                      color:
                        metaDesc.length > 160
                          ? "hsl(var(--admin-danger))"
                          : "hsl(var(--admin-text-ghost))",
                    }}
                  >
                    {metaDesc.length}/160
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="seo-keywords"
                    className="admin-label"
                    style={{ fontSize: 10 }}
                  >
                    Keywords
                  </label>
                  <input
                    id="seo-keywords"
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="comma, separated, keywords"
                    className="admin-input font-body w-full"
                  />
                </div>
                <div>
                  <label
                    htmlFor="seo-og-image"
                    className="admin-label"
                    style={{ fontSize: 10 }}
                  >
                    OG Image URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="seo-og-image"
                      value={ogImage}
                      onChange={(e) => setOgImage(e.target.value)}
                      placeholder="https://..."
                      className="admin-input font-body w-full"
                    />
                    <button
                      onClick={handleGenerateOg}
                      disabled={generatingOg}
                      className="admin-btn-ghost flex items-center gap-1 whitespace-nowrap"
                      style={{ fontSize: 11 }}
                    >
                      {generatingOg ? (
                        <Loader2
                          size={12}
                          className="animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Wand2 size={12} aria-hidden />
                      )}
                      {generatingOg ? "Generating..." : "Generate"}
                    </button>
                  </div>
                  {ogImage && (
                    <img
                      src={ogImage}
                      alt="OG preview"
                      style={{
                        marginTop: 8,
                        width: "100%",
                        borderRadius: 4,
                        border: "1px solid hsl(var(--admin-border))",
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Regenerate */}
          <div className="admin-card" style={{ padding: 20 }}>
            <span className="admin-label" style={{ marginBottom: 8 }}>
              Regenerate
            </span>
            <p
              className="font-body"
              style={{
                fontSize: 11,
                color: "hsl(var(--admin-text-ghost))",
                marginBottom: 12,
              }}
            >
              Rewrites this page's content with fresh research. Title and URL
              stay the same; manual edits are replaced.
            </p>
            <button
              onClick={() => setConfirmRegenerate(true)}
              disabled={regenerateMutation.isPending}
              className="admin-btn-ghost w-full flex items-center justify-center gap-2"
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={regenerateMutation.isPending ? "animate-spin" : ""}
              />
              {regenerateMutation.isPending
                ? "Regenerating..."
                : "Regenerate Content"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedPageEditor;
