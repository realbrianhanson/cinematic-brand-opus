import { useEditorRecovery } from "@/hooks/useEditorRecovery";
import EditorialBrief from "./EditorialBrief";
import EditorialChecklist from "./EditorialChecklist";
import EditorPreview from "./EditorPreview";
import PublishReadinessCard from "./PublishReadinessCard";
import PublishOverrideDialog, {
  type OverrideRequest,
} from "./PublishOverrideDialog";
import {
  callManualPublish,
  isOverride,
  type PublishMode,
  type PublishOutcome,
} from "./manualPublishClient";
import { z } from "zod";
import type {
  Json,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { scheduledInstant, zonedInput } from "@/lib/scheduleTime";
import { useAdminPreferences } from "@/hooks/useAdminPreferences";
import { useParams, useNavigate } from "@/lib/router-compat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/react";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import RichTextEditor from "./RichTextEditor";
import {
  describeDroppedElements,
  findDroppedElements,
  serializeEditorHtml,
  type DroppedElement,
} from "./extensions/contentFidelity";
import PostEditorSidebar from "./PostEditorSidebar";
import PostEditorAiHelper from "./PostEditorAiHelper";
import PostEditorAeoPanel from "./PostEditorAeoPanel";
import PostEditorSeoPanel from "./PostEditorSeoPanel";
import { ChevronDown, ChevronUp, Sparkles, Loader2, Wand2 } from "lucide-react";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const wordCount = (html: string) => {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
};
const bodyFields = (content: string) => ({
  content,
  reading_time: Math.max(1, Math.round(wordCount(content) / 200)),
});

const faqSchema = z
  .array(z.object({ question: z.string(), answer: z.string() }))
  .catch([]);
type FaqItem = z.infer<typeof faqSchema>[number];
type PublishDone = Extract<PublishOutcome, { kind: "done" }>;
type SaveResult =
  | { postId: string; kind: "saved" }
  | { postId: string; kind: "published"; outcome: PublishDone }
  | { postId: string; kind: "blocked"; request: OverrideRequest }
  | {
      postId: string;
      kind: "publish_failed";
      mode: PublishMode;
      message: string;
    };

/**
 * Going live (now or on a schedule) always runs through manual-publish, so the
 * row's status and schedule are never written directly for those changes.
 */
function publishIntent(
  status: string,
  initialStatus: string,
  scheduledAt: string,
  savedScheduleInput: string,
): PublishMode | null {
  if (status === "published" && initialStatus !== "published") return "publish";
  if (
    status === "scheduled" &&
    (initialStatus !== "scheduled" || scheduledAt !== savedScheduleInput)
  )
    return "schedule";
  return null;
}

function savedStateLabel(status: string, scheduledAt: string | null) {
  if (status === "published") return "live";
  if (status === "scheduled")
    return scheduledAt
      ? `scheduled for ${new Date(scheduledAt).toLocaleString()}`
      : "scheduled";
  return "a draft";
}

function publishedTitle(outcome: PublishDone) {
  const when =
    outcome.decision.startsWith("scheduled") && outcome.scheduledAt
      ? `Scheduled for ${new Date(outcome.scheduledAt).toLocaleString()}`
      : outcome.decision.startsWith("scheduled")
        ? "Scheduled"
        : "Published";
  return isOverride(outcome.decision) ? `${when} with override` : when;
}

/**
 * Remounts the editor after a server-side rewrite (Fix facts, fact check) so
 * it never keeps a stale copy or version of the article.
 */
export default function PostEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(async () => {
    await qc.refetchQueries({ queryKey: ["admin-post", id] });
    setGeneration((g) => g + 1);
  }, [qc, id]);
  return <PostEditorBody key={generation} onServerChange={reload} />;
}

function PostEditorBody({
  onServerChange,
}: {
  onServerChange: () => Promise<void>;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !id;
  const savedPostId = useRef<string | undefined>(id);
  const editorRef = useRef<Editor | null>(null);

  // Core state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("draft");
  const [initialStatus, setInitialStatus] = useState("draft");
  const [publishBlock, setPublishBlock] = useState<OverrideRequest | null>(
    null,
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const { prefs, updatePref } = useAdminPreferences();
  const [timezone, setTimezone] = useState(prefs.timezone);
  const scheduleTouched = useRef(false);
  useEffect(() => {
    if (!scheduleTouched.current) setTimezone(prefs.timezone);
  }, [prefs.timezone]);
  useEffect(() => {
    savedPostId.current = id;
    scheduleTouched.current = false;
  }, [id]);
  const [featuredImage, setFeaturedImage] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");
  const [editorialMetadata, setEditorialMetadata] = useState<Json>({});
  const [sourceCitations, setSourceCitations] = useState<Json>([]);
  const [generationFlags, setGenerationFlags] = useState<Json>([]);
  const [uploading, setUploading] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  // Set when loading HTML into the editor would drop markup. The body is then
  // read-only and Save never writes the editor's stripped re-serialization.
  const [bodyLock, setBodyLock] = useState<{
    source: string;
    dropped: DroppedElement[];
  } | null>(null);
  const loadBody = useCallback((editor: Editor, html: string) => {
    // Loading is not an edit: emitUpdate:false keeps the raw HTML in state.
    editor.commands.setContent(html, { emitUpdate: false });
    const dropped = findDroppedElements(html, serializeEditorHtml(editor));
    const locked = dropped.length > 0;
    editor.setEditable(!locked, false);
    setBodyLock(locked ? { source: html, dropped } : null);
  }, []);

  // SEO state
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");

  // AEO state
  const [aeoOpen, setAeoOpen] = useState(false);
  const [tldr, setTldr] = useState("");
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([""]);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([
    { question: "", answer: "" },
  ]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // AI blog generation state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiWriting, setAiWriting] = useState(false);

  // Queries
  const {
    data: post,
    isLoading: postLoading,
    error: postError,
  } = useQuery({
    queryKey: ["admin-post", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const {
    data: seo,
    isLoading: seoLoading,
    error: seoError,
  } = useQuery({
    queryKey: ["admin-seo", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seo_metadata")
        .select("*")
        .eq("post_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      return data ?? [];
    },
  });

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if ((!isNew && (postLoading || seoLoading)) || postError || seoError)
      return;
    const timer = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(timer);
  }, [isNew, postLoading, seoLoading, postError, seoError]);
  const snapshot = {
    title,
    slug,
    excerpt,
    categoryId,
    status,
    scheduledAt,
    timezone,
    featuredImage,
    featuredImageAlt,
    editorialMetadata,
    sourceCitations,
    generationFlags,
    editorContent,
    metaTitle,
    metaDesc,
    keywords,
    ogImage,
    tldr,
    keyTakeaways,
    faqItems,
  };
  const recovery = useEditorRecovery(
    id || "new",
    snapshot,
    hydrated,
    post?.updated_at,
  );
  function restoreSnapshot(value: Record<string, unknown>) {
    const result = z
      .object({
        title: z.string(),
        slug: z.string(),
        excerpt: z.string(),
        categoryId: z.string(),
        status: z.enum(["draft", "published", "scheduled"]),
        scheduledAt: z.string(),
        timezone: z.string(),
        featuredImage: z.string(),
        featuredImageAlt: z.string().default(""),
        editorialMetadata: z.unknown().default({}),
        sourceCitations: z.unknown().default([]),
        generationFlags: z.unknown().default([]),
        editorContent: z.string(),
        metaTitle: z.string(),
        metaDesc: z.string(),
        keywords: z.string(),
        ogImage: z.string(),
        tldr: z.string(),
        keyTakeaways: z.array(z.string()),
        faqItems: faqSchema,
      })
      .safeParse(value);
    if (!result.success) {
      toast({
        title: "This saved copy could not be restored",
        variant: "destructive",
      });
      return;
    }
    const d = result.data;
    setTitle(d.title);
    setSlug(d.slug);
    setSlugManual(true);
    setExcerpt(d.excerpt);
    setCategoryId(d.categoryId);
    setStatus(d.status);
    setScheduledAt(d.scheduledAt);
    scheduleTouched.current = true;
    setTimezone(d.timezone);
    setFeaturedImage(d.featuredImage);
    setFeaturedImageAlt(d.featuredImageAlt);
    setEditorialMetadata(d.editorialMetadata as Json);
    setSourceCitations(d.sourceCitations as Json);
    setGenerationFlags(d.generationFlags as Json);
    setEditorContent(d.editorContent);
    if (editorRef.current) loadBody(editorRef.current, d.editorContent);
    setMetaTitle(d.metaTitle);
    setMetaDesc(d.metaDesc);
    setKeywords(d.keywords);
    setOgImage(d.ogImage);
    setTldr(d.tldr);
    setKeyTakeaways(d.keyTakeaways);
    setFaqItems(d.faqItems);
    recovery.resolveRecovery();
  }
  const revisions = useQuery({
    queryKey: ["post-revisions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_revisions")
        .select("id,created_at,snapshot")
        .eq("post_id", id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  function restoreRevision(value: unknown) {
    const r = z
      .object({
        post: z.record(z.unknown()),
        seo: z.record(z.unknown()).nullable(),
      })
      .safeParse(value);
    if (!r.success) return;
    const p = r.data.post,
      meta = r.data.seo;
    restoreSnapshot({
      ...snapshot,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt || "",
      categoryId: p.category_id || "",
      featuredImage: p.featured_image || "",
      featuredImageAlt: p.featured_image_alt || "",
      editorialMetadata: p.editorial_metadata || {},
      sourceCitations: p.source_citations || [],
      generationFlags: p.lint_flags || [],
      editorContent: p.content || "",
      tldr: p.tldr || "",
      keyTakeaways: p.key_takeaways || [],
      faqItems: p.faq_items || [],
      metaTitle: meta?.meta_title || "",
      metaDesc: meta?.meta_description || "",
      keywords: Array.isArray(meta?.keywords) ? meta.keywords.join(", ") : "",
      ogImage: meta?.og_image || "",
    });
  }

  const initializedPost = useRef<string | null>(null);
  const initializedSeo = useRef(false);
  const persistedVersion = useRef<string | null>(null);
  // Hydrate once. Background refreshes must not overwrite unsaved typing.
  useEffect(() => {
    if (post && initializedPost.current !== post.id) {
      initializedPost.current = post.id;
      persistedVersion.current = post.updated_at;
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt ?? "");
      setCategoryId(post.category_id ?? "");
      setStatus(post.status);
      setInitialStatus(post.status);

      setFeaturedImage(post.featured_image ?? "");
      setFeaturedImageAlt(post.featured_image_alt ?? "");
      setEditorialMetadata(post.editorial_metadata || {});
      setSourceCitations(post.source_citations || []);
      setGenerationFlags(post.lint_flags || []);
      setSlugManual(true);
      setTldr(post.tldr ?? "");
      const parsedTakeaways = z
        .array(z.string())
        .catch([])
        .parse(post.key_takeaways);
      setKeyTakeaways(parsedTakeaways.length ? parsedTakeaways : [""]);
      const parsedFaq = faqSchema.parse(post.faq_items);
      setFaqItems(
        parsedFaq.length ? parsedFaq : [{ question: "", answer: "" }],
      );
      if (editorRef.current && post.content) {
        loadBody(editorRef.current, post.content);
      }
      setEditorContent(post.content ?? "");
    }
  }, [post, loadBody]);

  useEffect(() => {
    if (!scheduleTouched.current)
      setScheduledAt(
        post?.scheduled_at ? zonedInput(post.scheduled_at, timezone) : "",
      );
  }, [post?.scheduled_at, timezone]);

  useEffect(() => {
    if (seo && !initializedSeo.current) {
      initializedSeo.current = true;
      setMetaTitle(seo.meta_title ?? "");
      setMetaDesc(seo.meta_description ?? "");
      setKeywords((seo.keywords ?? []).join(", "));
      setOgImage(seo.og_image ?? "");
    }
  }, [seo]);

  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  // Handlers
  const handleFeaturedUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("blog-images")
        .upload(path, file);
      if (error) {
        toast({
          title: "Upload failed",
          description: error.message,
          variant: "destructive",
        });
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("blog-images")
        .getPublicUrl(path);
      setFeaturedImage(urlData.publicUrl);
      setFeaturedImageAlt("");
      setUploading(false);
    },
    [toast],
  );

  // FAQ & takeaway helpers
  const addFaq = useCallback(
    () => setFaqItems((prev) => [...prev, { question: "", answer: "" }]),
    [],
  );
  const removeFaq = useCallback(
    (i: number) => setFaqItems((prev) => prev.filter((_, idx) => idx !== i)),
    [],
  );
  const updateFaq = useCallback(
    (i: number, field: keyof FaqItem, val: string) => {
      setFaqItems((prev) => {
        const u = [...prev];
        u[i] = { ...u[i], [field]: val };
        return u;
      });
    },
    [],
  );
  const addTakeaway = useCallback(
    () => setKeyTakeaways((prev) => [...prev, ""]),
    [],
  );
  const removeTakeaway = useCallback(
    (i: number) =>
      setKeyTakeaways((prev) => prev.filter((_, idx) => idx !== i)),
    [],
  );
  const updateTakeaway = useCallback((i: number, val: string) => {
    setKeyTakeaways((prev) => {
      const u = [...prev];
      u[i] = val;
      return u;
    });
  }, []);

  // Scoring
  const currentContent = editorContent;

  const criteria = useMemo(
    () => [
      {
        label: "Descriptive search title",
        done: !!metaTitle.trim(),
        points: "",
        category: "Metadata",
      },
      {
        label: "Specific search description",
        done: !!metaDesc.trim(),
        points: "",
        category: "Metadata",
      },
      {
        label: "Reader-facing excerpt",
        done: !!excerpt.trim(),
        points: "",
        category: "Metadata",
      },
      {
        label: "Source links to verify",
        done: /href=["']https?:\/\//i.test(currentContent),
        points: "",
        category: "Review",
      },
    ],
    [metaTitle, metaDesc, excerpt, currentContent],
  );

  const aeoTips = useMemo(
    () => [
      "Answer the reader's question fully; there is no ideal word count.",
      "Use headings, summaries, and FAQs only where they help the reader.",
      "Link important claims to primary sources and verify them manually.",
    ],
    [],
  );

  // AI generation
  const handleAiGenerate = useCallback(async () => {
    const content = editorContent;
    if (!title && !content) {
      toast({
        title: "Need content",
        description: "Add a title or some content first.",
        variant: "destructive",
      });
      return;
    }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-seo-aeo",
        {
          body: { title, content, excerpt },
        },
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.tldr) setTldr(data.tldr);
      if (Array.isArray(data.key_takeaways))
        setKeyTakeaways(data.key_takeaways);
      if (Array.isArray(data.faq_items)) setFaqItems(data.faq_items);
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);
      setAeoOpen(true);
      setSeoOpen(true);
      setHasGenerated(true);
      toast({
        title: "AI Generated!",
        description: "All SEO & AEO/GEO fields have been filled.",
      });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  }, [title, editorContent, excerpt, toast]);

  const handleEnhance = useCallback(async () => {
    const content = editorContent;
    const missing = criteria.filter((c) => !c.done).map((c) => c.label);
    if (missing.length === 0) {
      toast({
        title: "Perfect score! 🎉",
        description: "All criteria are already met.",
      });
      return;
    }
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-seo-aeo",
        {
          body: {
            title,
            content,
            excerpt,
            enhance: true,
            missing_criteria: missing,
          },
        },
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.tldr) setTldr(data.tldr);
      if (Array.isArray(data.key_takeaways))
        setKeyTakeaways(data.key_takeaways);
      if (Array.isArray(data.faq_items)) setFaqItems(data.faq_items);
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);
      if (data.enhanced_content && editorRef.current) {
        loadBody(editorRef.current, data.enhanced_content);
        setEditorContent(data.enhanced_content);
      }
      setAeoOpen(true);
      setSeoOpen(true);
      toast({
        title: "Editorial suggestions applied",
        description:
          "Review the changes for accuracy and usefulness before saving.",
      });
    } catch (e) {
      toast({
        title: "Enhancement failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setEnhancing(false);
    }
  }, [title, editorContent, excerpt, criteria, toast, loadBody]);

  // AI Blog Post Generation
  const handleAiWritePost = useCallback(async () => {
    if (!aiTopic.trim()) {
      toast({
        title: "Enter a topic",
        description: "Provide a topic for the AI to write about.",
        variant: "destructive",
      });
      return;
    }
    setAiWriting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-blog-post",
        {
          body: {
            topic: aiTopic.trim(),
            additional_context: aiContext.trim() || undefined,
          },
          signal: AbortSignal.timeout(300000),
        },
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Populate all fields
      if (data.title) {
        setTitle(data.title);
        setSlug(slugify(data.title));
        setSlugManual(false);
      }
      if (data.content && editorRef.current) {
        loadBody(editorRef.current, data.content);
        setEditorContent(data.content);
      }
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.tldr) setTldr(data.tldr);
      if (Array.isArray(data.key_takeaways))
        setKeyTakeaways(data.key_takeaways);
      if (Array.isArray(data.faq_items)) setFaqItems(data.faq_items);
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);
      setFeaturedImage(data.featured_image || "");
      setFeaturedImageAlt(data.featured_image_alt || "");
      setEditorialMetadata(data.editorial_metadata || {});
      setSourceCitations(data.source_citations || []);
      setGenerationFlags(data.lint_flags || []);

      setAeoOpen(true);
      setSeoOpen(true);
      setHasGenerated(true);
      setShowAiModal(false);
      setAiTopic("");
      setAiContext("");
      toast({
        title: "Blog post generated! ✨",
        description:
          "AI wrote your entire post. Review and edit before publishing.",
      });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      setAiWriting(false);
    }
  }, [aiTopic, aiContext, toast, loadBody]);

  const savedScheduleInput = post?.scheduled_at
    ? zonedInput(post.scheduled_at, timezone)
    : "";
  const intent = publishIntent(
    status,
    initialStatus,
    scheduledAt,
    savedScheduleInput,
  );
  const savedState = savedStateLabel(initialStatus, post?.scheduled_at ?? null);

  const submittedSnapshot = useRef<string | undefined>(undefined);

  /** Reconcile local state after manual-publish changed the article. */
  async function finishPublish(outcome: PublishDone) {
    if (outcome.updatedAt) persistedVersion.current = outcome.updatedAt;
    const next = outcome.decision.startsWith("scheduled")
      ? "scheduled"
      : "published";
    setInitialStatus(next);
    setStatus(next);
    qc.invalidateQueries({ queryKey: ["admin-posts"] });
    qc.invalidateQueries({ queryKey: ["admin-post", id] });
    const title = publishedTitle(outcome);
    if (!(await recovery.clear(submittedSnapshot.current))) {
      toast({ title, description: "Newer edits remain in the editor" });
      return;
    }
    toast({ title });
    navigate("/admin/posts");
  }

  const saveMutation = useMutation({
    onMutate: () => {
      submittedSnapshot.current = JSON.stringify(snapshot);
    },
    mutationFn: () =>
      safeMutation(async (): Promise<SaveResult> => {
        // A locked body is only ever saved verbatim, and not at all when it is
        // still the stored body.
        const body = bodyLock
          ? bodyLock.source === post?.content
            ? {}
            : bodyFields(bodyLock.source)
          : bodyFields(editorContent);
        const cleanFaq = faqItems.filter(
          (f) => f.question.trim() && f.answer.trim(),
        );
        const cleanTakeaways = keyTakeaways.filter((t) => t.trim());

        const scheduledISO =
          status === "scheduled"
            ? scheduledInstant(scheduledAt, timezone)
            : null;
        if (
          intent === "schedule" &&
          scheduledISO &&
          Date.parse(scheduledISO) <= Date.now()
        )
          throw new Error("Choose a future publish time.");
        const content = {
          title,
          slug,
          ...body,
          excerpt: excerpt || null,
          category_id: categoryId || null,
          featured_image: featuredImage || null,
          featured_image_alt: featuredImageAlt || null,
          editorial_metadata: editorialMetadata,
          source_citations: sourceCitations,
          lint_flags: generationFlags,
          faq_items: cleanFaq.length ? cleanFaq : [],
          key_takeaways: cleanTakeaways.length ? cleanTakeaways : [],
          tldr: tldr || null,
        };
        // Publishing or scheduling leaves status and schedule untouched here:
        // a failed or blocked attempt must not unschedule or unpublish.
        const statusFields: TablesUpdate<"posts"> = intent
          ? {}
          : status === "scheduled"
            ? { status }
            : { status, scheduled_at: null };

        let postId = savedPostId.current ?? id;
        if (!postId) {
          const insert: TablesInsert<"posts"> = {
            ...content,
            status: intent ? "draft" : status,
            scheduled_at: null,
          };
          const { data, error } = await supabase
            .from("posts")
            .insert(insert)
            .select("id,updated_at")
            .single();
          if (error) throw error;
          persistedVersion.current = data.updated_at;
          postId = data.id;
          savedPostId.current = postId;
        } else {
          let update = supabase
            .from("posts")
            .update({ ...content, ...statusFields })
            .eq("id", postId!);
          if (persistedVersion.current)
            update = update.eq("updated_at", persistedVersion.current);
          const { data: saved, error } = await update
            .select("id,updated_at")
            .single();
          if (error)
            throw new Error(
              "The article could not be saved or changed in another session. Your working copy is retained; reload and review before retrying.",
            );
          persistedVersion.current = saved.updated_at;
        }

        const seoData = {
          post_id: postId!,
          meta_title: metaTitle || null,
          meta_description: metaDesc || null,
          keywords: keywords
            ? keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
            : null,
          og_image: ogImage || null,
        };

        const seoResult = await supabase
          .from("seo_metadata")
          .upsert(seoData, { onConflict: "post_id" })
          .select("id")
          .single();
        if (seoResult.error)
          throw new Error(
            `Post saved, but SEO settings failed: ${seoResult.error.message}. Retry to finish saving this same post.`,
          );

        if (!intent) return { postId, kind: "saved" };
        // The gated status change, for this one article only.
        try {
          const outcome = await callManualPublish({
            postId,
            mode: intent,
            scheduledAt: scheduledISO,
          });
          if (outcome.kind === "blocked")
            return {
              postId,
              kind: "blocked",
              request: {
                postId,
                title,
                mode: intent,
                scheduledAt: scheduledISO,
                failures: outcome.failures,
                reasonError: outcome.reasonError,
              },
            };
          return { postId, kind: "published", outcome };
        } catch (e) {
          return {
            postId,
            kind: "publish_failed",
            mode: intent,
            message: errorMessage(e),
          };
        }
      }, 30000),
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      if (result.kind === "published") {
        await finishPublish(result.outcome);
        return;
      }
      if (result.kind === "saved") {
        if (!(await recovery.clear(submittedSnapshot.current))) {
          toast({ title: "Saved. Newer edits remain in the editor." });
          return;
        }
        toast({ title: "Saved" });
        navigate("/admin/posts");
        return;
      }
      // Saved, but not live: keep editing with autosave on.
      qc.invalidateQueries({ queryKey: ["admin-post", id] });
      await recovery.markSaved(submittedSnapshot.current);
      if (result.kind === "blocked") {
        setPublishBlock(result.request);
        toast({
          title: "Saved, but not live yet",
          description: `Your changes were saved. The article is still ${savedState}. See what needs fixing`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title:
          result.mode === "schedule"
            ? "Changes saved, but scheduling failed"
            : "Changes saved, but publishing failed",
        description: `${result.message}. The article is still ${savedState}. Try again when you're ready`,
        variant: "destructive",
      });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Override for this one article, with the reason Brian typed.
  const overrideMutation = useMutation({
    mutationFn: ({
      request,
      reason,
    }: {
      request: OverrideRequest;
      reason: string;
    }) =>
      callManualPublish({
        postId: request.postId,
        mode: request.mode,
        scheduledAt: request.scheduledAt,
        overrideReason: reason,
      }),
    onSuccess: async (outcome, { request }) => {
      if (outcome.kind === "blocked") {
        setPublishBlock({
          ...request,
          failures: outcome.failures.length
            ? outcome.failures
            : request.failures,
          reasonError:
            outcome.reasonError ??
            "The checks still failed. Review the issues, then try again",
        });
        return;
      }
      setPublishBlock(null);
      await finishPublish(outcome);
    },
    onError: (error, { request }) => {
      toast({
        title:
          request.mode === "schedule" ? "Scheduling failed" : "Publish failed",
        description: `${errorMessage(error)}. Your changes are saved; the article is still ${savedState}`,
        variant: "destructive",
      });
    },
  });
  const focusArticleBody = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    editor.commands.focus();
    editor.view.dom.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, []);

  const handleEditorReady = useCallback(
    (editor: Editor | null) => {
      editorRef.current = editor;
      if (editor && !editor.isDestroyed && post?.content)
        loadBody(editor, post.content);
    },
    [post, loadBody],
  );

  if (postError || seoError)
    return (
      <p role="alert">
        The article could not be loaded. Reload before editing.
      </p>
    );
  if (!isNew && !postLoading && !post)
    return (
      <p role="alert">
        This article no longer exists.{" "}
        <button onClick={() => navigate("/admin/posts")}>
          Back to articles
        </button>
      </p>
    );
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 64 }}>
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: "hsl(var(--admin-accent))" }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-4"
        style={{ marginBottom: 24 }}
      >
        <h1
          className="font-heading italic"
          style={{ fontSize: 28, fontWeight: 400 }}
        >
          {isNew ? "New Post" : "Edit Post"}
        </h1>
        <div className="flex flex-wrap gap-3">
          <EditorPreview
            title={title}
            content={bodyLock ? bodyLock.source : editorContent}
            excerpt={excerpt}
            tldr={tldr}
            featuredImage={featuredImage}
            featuredImageAlt={featuredImageAlt}
            keyTakeaways={keyTakeaways}
            faqItems={faqItems}
            savedSlug={!isNew ? post?.slug : undefined}
            published={initialStatus === "published"}
          />
          {isNew && (
            <button
              onClick={() => setShowAiModal(true)}
              className="flex items-center gap-2 font-body"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Wand2 size={14} />
              AI Write Post
            </button>
          )}
          <button
            onClick={() => navigate("/admin/posts")}
            className="admin-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending ||
              overrideMutation.isPending ||
              !title ||
              !slug
            }
            className="admin-btn-primary"
          >
            {saveMutation.isPending
              ? intent === "publish"
                ? "Publishing…"
                : intent === "schedule"
                  ? "Scheduling…"
                  : "Saving..."
              : intent === "publish"
                ? "Save & publish"
                : intent === "schedule"
                  ? "Save & schedule"
                  : "Save"}
          </button>
        </div>
      </div>

      <div className="admin-notice mb-5" role="status">
        {recovery.message}
        <span className="admin-help">
          Autosave protects your working copy. Save applies changes to the
          article.
        </span>
      </div>
      {recovery.recovery && (
        <div className="admin-notice mb-5">
          <span>A saved working copy is available.</span>
          <button
            className="admin-btn-primary"
            onClick={() => restoreSnapshot(recovery.recovery!)}
          >
            Restore working copy
          </button>
          <button
            className="admin-btn-ghost"
            onClick={() => void recovery.discardRecovery()}
          >
            Keep current version
          </button>
        </div>
      )}
      {id && (
        <details className="admin-card p-4 mb-5">
          <summary>Revision history</summary>
          <p className="admin-help">
            Restore into the editor, review, then Save. The last 20 article
            versions are retained.
          </p>
          {revisions.error && (
            <p role="alert">Revision history could not be loaded.</p>
          )}
          {revisions.data?.length === 0 && <p>No saved revisions yet.</p>}
          {revisions.data?.map((r) => (
            <button
              key={r.id}
              className="admin-btn-ghost"
              onClick={() => {
                if (
                  window.confirm(
                    "Replace the current editor contents with this revision? It will not publish until you save.",
                  )
                )
                  restoreRevision(r.snapshot);
              }}
            >
              Restore {new Date(r.created_at).toLocaleString()}
            </button>
          ))}
        </details>
      )}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <input
            aria-label="Post title"
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="admin-input font-heading"
            style={{
              fontSize: 26,
              fontWeight: 400,
              padding: "16px 20px",
              borderRadius: 6,
            }}
          />
          <div className="flex items-center gap-2">
            <span
              className="font-body"
              style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}
            >
              /blog/
            </span>
            <input
              aria-label="Article URL slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManual(true);
              }}
              className="admin-input font-body flex-1"
            />
          </div>
          {bodyLock && (
            <div className="admin-notice" role="alert">
              {`This article uses formatting the editor can't keep: ${describeDroppedElements(bodyLock.dropped)}. Body editing is off so nothing is stripped. Save keeps the body exactly as loaded; title, SEO and other fields still save normally.`}
            </div>
          )}
          <RichTextEditor
            content={editorContent}
            onChange={(html) => setEditorContent(html)}
            onEditorReady={handleEditorReady}
          />
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <PostEditorSidebar
            status={status}
            setStatus={setStatus}
            timezone={timezone}
            setTimezone={(v: string) => {
              scheduleTouched.current = true;
              setTimezone(v);
              updatePref("timezone", v);
            }}
            scheduledAt={scheduledAt}
            setScheduledAt={(value) => {
              scheduleTouched.current = true;
              setScheduledAt(value);
            }}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            categories={categories ?? []}
            featuredImage={featuredImage}
            featuredImageAlt={featuredImageAlt}
            setFeaturedImageAlt={setFeaturedImageAlt}
            setFeaturedImage={setFeaturedImage}
            uploading={uploading}
            onFeaturedUpload={handleFeaturedUpload}
            excerpt={excerpt}
            setExcerpt={setExcerpt}
            readiness={
              <PublishReadinessCard
                postId={id ?? savedPostId.current ?? null}
                status={initialStatus}
                updatedAt={post?.updated_at ?? null}
                heldReason={post?.held_reason ?? null}
                heldAt={post?.held_at ?? null}
                contradictedCount={post?.contradicted_count ?? 0}
                dirty={recovery.dirty}
                onServerChange={onServerChange}
                onEditArticle={focusArticleBody}
              />
            }
          />

          <EditorialBrief value={editorialMetadata} />
          <EditorialChecklist html={editorContent} />
          <PostEditorAiHelper
            criteria={criteria}
            aiGenerating={aiGenerating}
            enhancing={enhancing}
            hasGenerated={hasGenerated}
            canGenerate={!!(title || editorContent)}
            onGenerate={handleAiGenerate}
            onEnhance={handleEnhance}
          />

          {/* AEO Panel */}
          <div className="admin-card">
            <button
              onClick={() => setAeoOpen(!aeoOpen)}
              className="font-body w-full flex items-center justify-between"
              style={{
                padding: 20,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--admin-text-soft))",
              }}
            >
              <span className="flex items-center gap-2">
                <Sparkles
                  size={14}
                  style={{ color: "hsl(var(--admin-accent))" }}
                />
                <span className="admin-label" style={{ marginBottom: 0 }}>
                  Summaries & reader questions
                </span>
              </span>
              {aeoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {aeoOpen && (
              <PostEditorAeoPanel
                tldr={tldr}
                setTldr={setTldr}
                keyTakeaways={keyTakeaways}
                faqItems={faqItems}
                addTakeaway={addTakeaway}
                removeTakeaway={removeTakeaway}
                updateTakeaway={updateTakeaway}
                addFaq={addFaq}
                removeFaq={removeFaq}
                updateFaq={updateFaq}
                aeoTips={aeoTips}
              />
            )}
          </div>

          {/* SEO Panel */}
          <div className="admin-card">
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="font-body w-full flex items-center justify-between"
              style={{
                padding: 20,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--admin-text-soft))",
              }}
            >
              <span className="flex items-center gap-2">
                <span className="admin-label" style={{ marginBottom: 0 }}>
                  Search appearance
                </span>
              </span>
              {seoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {seoOpen && (
              <PostEditorSeoPanel
                metaTitle={metaTitle}
                setMetaTitle={setMetaTitle}
                metaDesc={metaDesc}
                setMetaDesc={setMetaDesc}
                keywords={keywords}
                setKeywords={setKeywords}
                ogImage={ogImage}
                setOgImage={setOgImage}
              />
            )}
          </div>
        </div>
      </div>

      {/* AI Write Post Modal */}
      {showAiModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="admin-card"
            style={{ padding: 32, maxWidth: 480, width: "90%" }}
          >
            <div
              className="flex items-center gap-2"
              style={{ marginBottom: 16 }}
            >
              <Wand2 size={16} style={{ color: "hsl(var(--admin-accent))" }} />
              <h2
                className="font-heading"
                style={{ fontSize: 20, fontWeight: 500 }}
              >
                AI Write Post
              </h2>
            </div>
            <p
              className="font-body"
              style={{
                fontSize: 13,
                color: "hsl(var(--admin-text-soft))",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              Enter a topic and AI will research it, then write a complete blog
              post with SEO metadata, FAQs, and key takeaways.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label className="admin-label">Topic / Keyword *</label>
              <input
                placeholder="e.g. How to use AI for content marketing in 2026"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                className="admin-input font-body w-full"
                disabled={aiWriting}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="admin-label">
                Additional Context (optional)
              </label>
              <textarea
                placeholder="e.g. Target audience is small business owners. Focus on practical tips."
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                className="admin-input font-body w-full"
                style={{ minHeight: 80, resize: "vertical" }}
                disabled={aiWriting}
              />
            </div>
            {aiWriting && (
              <div
                className="flex items-center gap-3 font-body"
                style={{
                  fontSize: 12,
                  color: "hsl(var(--admin-accent))",
                  marginBottom: 16,
                }}
              >
                <Loader2 size={14} className="animate-spin" />
                <span>Researching &amp; writing… this takes 30-60 seconds</span>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAiModal(false);
                  setAiTopic("");
                  setAiContext("");
                }}
                className="admin-btn-ghost"
                disabled={aiWriting}
              >
                Cancel
              </button>
              <button
                onClick={handleAiWritePost}
                disabled={aiWriting || !aiTopic.trim()}
                className="admin-btn-primary flex items-center gap-2"
              >
                {aiWriting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate Post
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <PublishOverrideDialog
        request={publishBlock}
        pending={overrideMutation.isPending}
        stateNote={`Your changes were saved. The article is still ${savedState}.`}
        onCancel={() => setPublishBlock(null)}
        onConfirm={(reason) =>
          publishBlock &&
          overrideMutation.mutate({ request: publishBlock, reason })
        }
      />
    </div>
  );
}
