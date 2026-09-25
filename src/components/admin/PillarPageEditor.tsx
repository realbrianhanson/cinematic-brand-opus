import { seoDocumentSchema } from "@/lib/contentDocument";
import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAdminDraftGuard } from "./useAdminDraftGuard";
import { z } from "zod";
import { useLocalEditorRecovery } from "@/hooks/useLocalEditorRecovery";
import LocalDraftRecoveryBanner from "./LocalDraftRecoveryBanner";
import { useParams, useNavigate } from "@/lib/router-compat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/react";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation, withTimeout } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import {
  checkGuidePublishReadiness,
  isPublishTransition,
  MIN_GUIDE_OVERRIDE_REASON,
} from "@/lib/guidePublishGate";

// publish_pillar_page_with_override is newer than the generated client types.
const publishGuideWithOverride = async (
  pillarId: string,
  reason: string,
  issues: string[],
) => {
  const { error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
    }
  ).rpc("publish_pillar_page_with_override", {
    p_pillar_id: pillarId,
    p_reason: reason,
    p_issues: issues,
  });
  if (error) throw error;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Saves that keep less than this share of the stored body text need a confirm. */
const MIN_KEPT_BODY_RATIO = 0.5;

/** Visible text length of stored HTML, measured the same way as the DB guard. */
const bodyTextLength = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;

const bodyLossWarning = (
  stored: string | null | undefined,
  next: string,
): string | null => {
  const before = bodyTextLength(stored);
  if (before === 0) return null;
  const after = bodyTextLength(next);
  if (after === 0)
    return "The guide body is empty. Saving will erase the stored guide text. Save anyway?";
  if (after < before * MIN_KEPT_BODY_RATIO)
    return `The guide body shrank from ${before} to ${after} characters of text. Save anyway?`;
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown) => (typeof value === "string" ? value : "");
export const GUIDE_IMAGE_UPLOAD_TIMEOUT_MS = 30_000;
const guideRecoverySchema = z
  .object({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    nicheId: z.string(),
    editorContent: z.string(),
    metaTitle: z.string(),
    metaDesc: z.string(),
    keywords: z.string(),
    ogImage: z.string(),
  })
  .strict();

const PillarPageEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !id;
  const editorRef = useRef<Editor | null>(null);
  const hydratedId = useRef<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [status, setStatus] = useState("draft");
  const [nicheId, setNicheId] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const activeGuideId = useRef(id);
  activeGuideId.current = id;
  // Publish gate: a guide that is too thin needs an override reason.
  const [gateBlock, setGateBlock] = useState<{
    issues: string[];
    content: string;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const draftSnapshot = {
    title,
    slug,
    status,
    nicheId,
    editorContent,
    metaTitle,
    metaDesc,
    keywords,
    ogImage,
  };
  const { markSaved } = useAdminDraftGuard(
    draftSnapshot,
    `guide:${id ?? "new"}`,
  );

  const {
    data: pillar,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin-pillar", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pillar_pages")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: niches } = useQuery({
    queryKey: ["admin-niches-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("niches")
        .select("id, name")
        .order("name");
      return data ?? [];
    },
  });

  const { data: connectedPages } = useQuery({
    queryKey: ["admin-pillar-connected", nicheId],
    queryFn: async () => {
      if (!nicheId) return [];
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, status")
        .eq("niche_id", nicheId)
        .order("title");
      return data ?? [];
    },
    enabled: !!nicheId,
  });

  useEffect(() => {
    // Hydrate once per guide so a background refetch never clobbers edits.
    if (pillar && hydratedId.current !== pillar.id) {
      hydratedId.current = pillar.id;
      setTitle(pillar.title);
      setSlug(pillar.slug);
      setSlugManual(true);
      setStatus(pillar.status ?? "draft");
      setNicheId(pillar.niche_id ?? "");
      setEditorContent(pillar.content ?? "");
      const seo = seoDocumentSchema.parse(pillar.seo_meta);
      // Generated guides store meta_title/meta_description; read both shapes.
      const rawSeo = asRecord(pillar.seo_meta);
      setMetaTitle(seo.title || asText(rawSeo.meta_title));
      setMetaDesc(seo.description || asText(rawSeo.meta_description));
      setKeywords((seo.keywords ?? []).join(", "));
      setOgImage(seo.og_image ?? "");
      markSaved({
        title: pillar.title,
        slug: pillar.slug,
        status: pillar.status ?? "draft",
        nicheId: pillar.niche_id ?? "",
        editorContent: pillar.content ?? "",
        metaTitle: seo.title || asText(rawSeo.meta_title),
        metaDesc: seo.description || asText(rawSeo.meta_description),
        keywords: (seo.keywords ?? []).join(", "),
        ogImage: seo.og_image ?? "",
      });
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed && pillar.content) {
        editor.commands.setContent(pillar.content, { emitUpdate: false });
      }
    }
  }, [pillar, markSaved]);

  const recovery = useLocalEditorRecovery({
    documentKey: `guide:${id ?? "new"}`,
    snapshot: draftSnapshot,
    ready:
      editorReady &&
      (isNew
        ? hydratedId.current === null
        : !!pillar && hydratedId.current === id),
    serverVersion: pillar?.updated_at,
    schema: guideRecoverySchema,
    onRestore: (draft) => {
      setTitle(draft.title);
      setSlug(draft.slug);
      setSlugManual(true);
      setStatus(draft.status);
      setNicheId(draft.nicheId);
      setEditorContent(draft.editorContent);
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed)
        editor.commands.setContent(draft.editorContent, { emitUpdate: false });
      setMetaTitle(draft.metaTitle);
      setMetaDesc(draft.metaDesc);
      setKeywords(draft.keywords);
      setOgImage(draft.ogImage);
      setGateBlock(null);
    },
  });

  // The editor is created after the data arrives (immediatelyRender: false),
  // so the stored body must be loaded when it reports ready, as PostEditor does.
  const handleEditorReady = useCallback(
    (editor: Editor | null) => {
      editorRef.current = editor;
      setEditorReady(!!editor);
      if (editor && !editor.isDestroyed && editor.isEmpty && pillar?.content) {
        editor.commands.setContent(pillar.content, { emitUpdate: false });
      }
    },
    [pillar],
  );

  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  const saveMutation = useMutation({
    mutationFn: ({
      publishNow,
      content,
      override,
      keepStatus,
    }: {
      publishNow: boolean;
      content: string;
      override?: { reason: string; issues: string[] };
      /** Save edits without changing the stored status. */
      keepStatus?: boolean;
    }) =>
      safeMutation(async () => {
        const requested = publishNow ? "published" : status;
        // With an override the edits are saved unpublished first; the audited
        // RPC then publishes past the gate.
        const finalStatus =
          override || keepStatus ? (pillar?.status ?? "draft") : requested;
        const seoTitle = metaTitle || title;
        // Merge so keys this form does not edit (faqs, sources, ...) survive,
        // and write both key shapes the site and generator read.
        const seoMeta = {
          ...asRecord(pillar?.seo_meta),
          title: seoTitle,
          meta_title: seoTitle,
          description: metaDesc,
          meta_description: metaDesc,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          og_image: ogImage || null,
        } as Json;
        const payload: TablesInsert<"pillar_pages"> = {
          title,
          slug,
          content,
          status: finalStatus,
          niche_id: nicheId || null,
          seo_meta: seoMeta,
          updated_at: new Date().toISOString(),
        };
        if (isPublishTransition(pillar?.status, finalStatus))
          payload.published_at = new Date().toISOString();

        let savedId = id ?? null;
        if (id) {
          const { data, error } = await supabase
            .from("pillar_pages")
            .update(payload)
            .eq("id", id)
            .select("id");
          if (error) throw error;
          if (!data?.length)
            throw new Error(
              "This topic guide no longer exists. Your changes were not saved.",
            );
        } else if (override) {
          const { data, error } = await supabase
            .from("pillar_pages")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          savedId = data.id;
        } else {
          const { error } = await supabase.from("pillar_pages").insert(payload);
          if (error) throw error;
        }
        if (override && savedId)
          await publishGuideWithOverride(
            savedId,
            override.reason,
            override.issues,
          );
        return draftSnapshot;
      }),
    onSuccess: (submitted) => {
      markSaved(submitted);
      recovery.clearSaved(submitted);
      qc.invalidateQueries({ queryKey: ["admin-pillars"] });
      toast({ title: "Pillar page saved" });
      navigate("/admin/pillars");
    },
    onError: (err: Error) =>
      toast({
        title: "Error",
        description: errorMessage(err),
        variant: "destructive",
      }),
  });

  const requestSave = (publishNow: boolean) => {
    if (saveMutation.isPending || uploading) return;
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) {
      toast({
        title: "Editor still loading",
        description: "Wait for the guide body to load, then save.",
        variant: "destructive",
      });
      return;
    }
    const content = editor.getHTML();
    const warning = id ? bodyLossWarning(pillar?.content, content) : null;
    if (warning && !window.confirm(warning)) return;
    const finalStatus = publishNow ? "published" : status;
    if (isPublishTransition(pillar?.status, finalStatus)) {
      const readiness = checkGuidePublishReadiness(content);
      if (!readiness.ok) {
        setOverrideReason("");
        setGateBlock({ issues: readiness.issues, content });
        return;
      }
    }
    saveMutation.mutate({ publishNow, content });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed)
      editor.setEditable(!saveMutation.isPending, false);
  }, [saveMutation.isPending, editorReady]);

  const handleOgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploadLock.current || saveMutation.isPending) return;
    uploadLock.current = true;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `pillar-og/${Date.now()}.${ext}`;
      const { error } = await withTimeout(
        supabase.storage.from("blog-images").upload(path, file),
        GUIDE_IMAGE_UPLOAD_TIMEOUT_MS,
      );
      if (error) throw error;
      if (activeGuideId.current !== id) return;
      const { data: urlData } = supabase.storage
        .from("blog-images")
        .getPublicUrl(path);
      setOgImage(urlData.publicUrl);
    } catch (error) {
      if (activeGuideId.current === id)
        toast({
          title: "Upload failed",
          description: errorMessage(error),
          variant: "destructive",
        });
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center" style={{ padding: 60 }}>
        <Loader2
          size={24}
          className="animate-spin"
          style={{ color: "hsl(var(--admin-text-ghost))" }}
        />
      </div>
    );
  }

  if (!isNew && isError) {
    return (
      <p role="alert" className="font-body" style={{ padding: 24 }}>
        The topic guide could not be loaded. Reload before editing.
      </p>
    );
  }

  if (!isNew && !pillar) {
    return (
      <p role="alert" className="font-body" style={{ padding: 24 }}>
        This topic guide no longer exists.{" "}
        <button
          type="button"
          onClick={() => navigate("/admin/pillars")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            color: "hsl(var(--admin-accent))",
          }}
        >
          Back to topic guides
        </button>
      </p>
    );
  }

  const saveDisabled =
    saveMutation.isPending || uploading || !title.trim() || !editorReady;
  const overrideReady =
    overrideReason.trim().length >= MIN_GUIDE_OVERRIDE_REASON;

  const publishedCount =
    connectedPages?.filter((p) => p.status === "published").length ?? 0;

  return (
    <fieldset
      disabled={saveMutation.isPending}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <LocalDraftRecoveryBanner
        recovery={recovery}
        disabled={saveMutation.isPending || uploading}
      />
      {gateBlock && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-gate-title"
            className="admin-card font-body"
            style={{ padding: 28, maxWidth: 480, width: "90%" }}
          >
            <h2
              id="guide-gate-title"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "hsl(var(--admin-text))",
                marginBottom: 10,
              }}
            >
              This guide is not ready to publish
            </h2>
            <ul style={{ paddingLeft: 16, marginBottom: 14 }}>
              {gateBlock.issues.map((issue) => (
                <li
                  key={issue}
                  style={{
                    listStyle: "disc",
                    fontSize: 13,
                    color: "hsl(var(--admin-text-soft))",
                  }}
                >
                  {issue}
                </li>
              ))}
            </ul>
            <label
              htmlFor="guide-override-reason"
              className="admin-label"
              style={{ fontSize: 11 }}
            >
              Reason to publish anyway (logged, at least{" "}
              {MIN_GUIDE_OVERRIDE_REASON} characters)
            </label>
            <textarea
              id="guide-override-reason"
              className="admin-input font-body w-full"
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              style={{ marginBottom: 16, resize: "vertical" }}
            />
            <div className="flex gap-2 justify-end flex-wrap">
              <button
                className="admin-btn-ghost"
                onClick={() => setGateBlock(null)}
              >
                Keep editing
              </button>
              <button
                className="admin-btn-ghost"
                disabled={saveMutation.isPending}
                onClick={() => {
                  const { content } = gateBlock;
                  setGateBlock(null);
                  setStatus(pillar?.status ?? "draft");
                  saveMutation.mutate({
                    publishNow: false,
                    content,
                    keepStatus: true,
                  });
                }}
              >
                Save without publishing
              </button>
              <button
                className="admin-btn-primary"
                disabled={!overrideReady || saveMutation.isPending}
                onClick={() => {
                  const { content, issues } = gateBlock;
                  setGateBlock(null);
                  saveMutation.mutate({
                    publishNow: true,
                    content,
                    override: { reason: overrideReason.trim(), issues },
                  });
                }}
              >
                Publish anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-3"
        style={{ marginBottom: 24 }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/pillars")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--admin-text-ghost))",
              display: "flex",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <h1
            className="font-body"
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "hsl(var(--admin-text))",
            }}
          >
            {isNew ? "New Pillar Page" : "Edit Pillar Page"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="admin-btn-primary font-body"
            onClick={() => requestSave(false)}
            disabled={saveDisabled}
          >
            {saveMutation.isPending && (
              <Loader2
                size={14}
                className="animate-spin"
                style={{ marginRight: 6 }}
              />
            )}
            Save
          </button>
          {status !== "published" && (
            <button
              className="font-body"
              onClick={() => requestSave(true)}
              disabled={saveDisabled}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                fontWeight: 500,
                backgroundColor: "hsl(var(--admin-sage))",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Left - Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <input
            className="admin-input font-body"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pillar page title"
            style={{ fontSize: 20, fontWeight: 600, padding: "14px 16px" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="admin-label"
              style={{ margin: 0, whiteSpace: "nowrap" }}
            >
              Slug:
            </span>
            <input
              className="admin-input font-body"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              style={{ flex: 1, fontSize: 13 }}
            />
          </div>
          <div
            className="admin-card"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <RichTextEditor
              key={pillar?.id ?? "new"}
              content={editorContent || pillar?.content || ""}
              onChange={(html) => setEditorContent(html)}
              onEditorReady={handleEditorReady}
            />
          </div>
        </div>

        {/* Right - Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status */}
          <div className="admin-card" style={{ padding: 16 }}>
            <span className="admin-label">Status</span>
            <select
              className="admin-input font-body"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ marginTop: 6, width: "100%" }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          {/* Niche */}
          <div className="admin-card" style={{ padding: 16 }}>
            <span className="admin-label">Niche</span>
            <select
              className="admin-input font-body"
              value={nicheId}
              onChange={(e) => setNicheId(e.target.value)}
              style={{ marginTop: 6, width: "100%" }}
            >
              <option value="">Select niche…</option>
              {(niches ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          {/* SEO */}
          <div className="admin-card" style={{ padding: 16 }}>
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex items-center justify-between w-full font-body"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--admin-text))",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              SEO Settings
              {seoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {seoOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div>
                  <span className="admin-label">Meta Title</span>
                  <input
                    className="admin-input font-body"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    style={{ marginTop: 4, width: "100%" }}
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
                  <span className="admin-label">Meta Description</span>
                  <textarea
                    className="admin-input font-body"
                    rows={3}
                    value={metaDesc}
                    onChange={(e) => setMetaDesc(e.target.value)}
                    style={{ marginTop: 4, width: "100%", resize: "vertical" }}
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
                  <span className="admin-label">Keywords</span>
                  <input
                    className="admin-input font-body"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="comma-separated"
                    style={{ marginTop: 4, width: "100%" }}
                  />
                </div>
                <div>
                  <span className="admin-label">OG Image</span>
                  {ogImage && (
                    <img
                      src={ogImage}
                      alt=""
                      style={{
                        width: "100%",
                        borderRadius: 4,
                        marginTop: 4,
                        marginBottom: 4,
                      }}
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Upload guide sharing image"
                    disabled={uploading}
                    onChange={handleOgUpload}
                    className="font-body"
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--admin-text-ghost))",
                      marginTop: 4,
                    }}
                  />
                  {uploading && (
                    <Loader2
                      size={14}
                      className="animate-spin"
                      style={{
                        color: "hsl(var(--admin-text-ghost))",
                        marginTop: 4,
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connected Pages */}
          {nicheId && (
            <div className="admin-card" style={{ padding: 16 }}>
              <span className="admin-label">Connected Pages</span>
              <p
                className="font-body"
                style={{
                  fontSize: 11,
                  color: "hsl(var(--admin-accent))",
                  margin: "6px 0 10px",
                }}
              >
                This pillar connects to {publishedCount} published page
                {publishedCount !== 1 ? "s" : ""}
              </p>
              <div
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {(connectedPages ?? []).map((pg) => (
                  <div
                    key={pg.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span
                      className="font-body"
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--admin-text-soft))",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {pg.title}
                    </span>
                    <span
                      className="font-body"
                      style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 999,
                        flexShrink: 0,
                        backgroundColor:
                          pg.status === "published"
                            ? "hsl(var(--admin-sage) / 0.12)"
                            : "hsl(var(--admin-text-ghost) / 0.15)",
                        color:
                          pg.status === "published"
                            ? "hsl(var(--admin-sage))"
                            : "hsl(var(--admin-text-ghost))",
                      }}
                    >
                      {pg.status}
                    </span>
                  </div>
                ))}
                {!connectedPages?.length && (
                  <span
                    className="font-body"
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--admin-text-ghost))",
                    }}
                  >
                    No pages for this niche yet.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </fieldset>
  );
};

export default PillarPageEditor;
