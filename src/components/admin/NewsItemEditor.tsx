import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useLocalEditorRecovery } from "@/hooks/useLocalEditorRecovery";
import LocalDraftRecoveryBanner from "./LocalDraftRecoveryBanner";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { safeMutation, withTimeout } from "@/lib/withTimeout";
import { scheduledInstant, zonedInput } from "@/lib/scheduleTime";
import {
  newsFeedIssue,
  newsSourceLabel,
} from "../../../supabase/functions/_shared/newsQuality";
import { safeHref } from "@/lib/newsMarkdown";
import {
  newsEditVersion,
  NewsEditConflict,
  updateNewsIfCurrent,
} from "../../../supabase/functions/_shared/newsConcurrency";
import { Loader2, X, Upload, ImageOff, ExternalLink } from "lucide-react";
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

type NewsItem = {
  id: string;
  edit_version: string;
  title: string | null;
  ai_title: string | null;
  ai_summary: string | null;
  raw_excerpt: string | null;
  full_content: string | null;
  image_url: string | null;
  author: string | null;
  url: string;
  topic_lane: string | null;
  published_at: string | null;
  status: string;
  source_id: string | null;
  source_name?: string | null;
};

interface Props {
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUSES = ["draft", "pending", "published", "archived"];
const newsRecoverySchema = z
  .object({
    title: z.string().nullable(),
    ai_title: z.string().nullable(),
    ai_summary: z.string().nullable(),
    raw_excerpt: z.string().nullable(),
    full_content: z.string().nullable(),
    image_url: z.string().nullable(),
    author: z.string().nullable(),
    url: z.string(),
    topic_lane: z.string().nullable(),
    published_at: z.string().nullable(),
    status: z.string(),
  })
  .strict();
const newsDraft = (
  item: NewsItem | null,
): z.infer<typeof newsRecoverySchema> => ({
  title: item?.title ?? null,
  ai_title: item?.ai_title ?? null,
  ai_summary: item?.ai_summary ?? null,
  raw_excerpt: item?.raw_excerpt ?? null,
  full_content: item?.full_content ?? null,
  image_url: item?.image_url ?? null,
  author: item?.author ?? null,
  url: item?.url ?? "",
  topic_lane: item?.topic_lane ?? null,
  published_at: item?.published_at ?? null,
  status: item?.status ?? "pending",
});
export const NEWS_IMAGE_UPLOAD_TIMEOUT_MS = 30_000;

const LANES = [
  "ai_tools",
  "smb_marketing",
  "ai_training",
  "industry",
  "local_news",
  "ai",
  "marketing",
  "sales",
  "business",
  "tech",
  "general",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "hsl(var(--admin-surface-2))",
  border: "1px solid hsl(var(--admin-border))",
  borderRadius: 6,
  color: "hsl(var(--admin-text))",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "hsl(var(--admin-text-ghost))",
  marginBottom: 6,
};

export default function NewsItemEditor({ itemId, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [item, setItem] = useState<NewsItem | null>(null);
  const [sourceName, setSourceName] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [latest, setLatest] = useState<NewsItem | null>(null);
  const original = useRef("");
  const activeItemId = useRef(itemId);
  activeItemId.current = itemId;
  const saveLock = useRef(false);
  const uploadLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setItem(null);
    setConfirmDiscard(false);
    setConflict(false);
    setLatest(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("source_items")
          .select("*, content_sources(name)")
          .eq("id", itemId)
          .maybeSingle();
        if (error) throw error;
        if (!data)
          throw new Error(
            "This news article no longer exists or your access changed.",
          );
        if (cancelled) return;
        const loaded = { ...data, edit_version: newsEditVersion(data) };
        original.current = JSON.stringify(loaded);
        setItem(loaded);
        setSourceName((data.content_sources?.name as string) || "");
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, loadAttempt]);

  const recovery = useLocalEditorRecovery({
    documentKey: `news:${itemId}`,
    snapshot: newsDraft(item),
    ready: !loading && item?.id === itemId && !loadError,
    serverVersion: item?.edit_version,
    schema: newsRecoverySchema,
    onRestore: (draft) =>
      setItem((current) =>
        current?.id === itemId ? { ...current, ...draft } : current,
      ),
  });

  const requestClose = () => {
    if (saveLock.current || uploadLock.current) return;
    if (item && JSON.stringify(item) !== original.current)
      setConfirmDiscard(true);
    else onClose();
  };

  const patch = (p: Partial<NewsItem>) =>
    setItem((prev) => (prev ? { ...prev, ...p } : prev));

  const compareLatest = async () => {
    if (comparing) return;
    setComparing(true);
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase
            .from("source_items")
            .select("*, content_sources(name)")
            .eq("id", itemId)
            .maybeSingle(),
        ),
        15_000,
      );
      if (error) throw error;
      if (!data)
        throw new Error(
          "This article no longer exists or your access changed.",
        );
      if (activeItemId.current !== itemId) return;
      setLatest({ ...data, edit_version: newsEditVersion(data) });
    } catch (error) {
      toast({
        title: "Couldn't load the latest version",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setComparing(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (uploadLock.current || saveLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `news/${itemId}-${Date.now()}.${ext}`;
      const { error } = await withTimeout(
        supabase.storage
          .from("blog-images")
          .upload(path, file, { upsert: true }),
        NEWS_IMAGE_UPLOAD_TIMEOUT_MS,
      );
      if (error) throw error;
      const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
      if (activeItemId.current !== itemId) return;
      patch({ image_url: data.publicUrl });
      toast({ title: "Image uploaded" });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };

  const save = async () => {
    if (!item || saveLock.current || uploadLock.current || conflict) return;
    const sourceUrl = safeHref(item.url);
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
      toast({
        title: "Use a valid report URL",
        description: "Link to the original HTTPS or HTTP source.",
        variant: "destructive",
      });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    const submittedDraft = newsDraft(item);
    try {
      await safeMutation(async () => {
        await updateNewsIfCurrent(
          { from: () => supabase.from("source_items") },
          item.id,
          item.edit_version,
          {
            title: item.title,
            ai_title: item.ai_title,
            ai_summary: item.ai_summary,
            raw_excerpt: item.raw_excerpt,
            full_content: item.full_content,
            image_url: item.image_url,
            author: item.author,
            url: sourceUrl,
            topic_lane: item.topic_lane,
            published_at: item.published_at,
            status: item.status,
          },
        );
      });
      if (activeItemId.current !== itemId) return;
      recovery.clearSaved(submittedDraft);
      toast({ title: "News updated successfully" });
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof NewsEditConflict && activeItemId.current === itemId)
        setConflict(true);
      toast({
        title: "Save failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div
        onClick={requestClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 100,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 900,
            background: "hsl(var(--admin-surface))",
            border: "1px solid hsl(var(--admin-border))",
            borderRadius: 10,
            padding: 24,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h2
              className="font-heading italic"
              style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}
            >
              Edit news article
            </h2>
            <button
              onClick={requestClose}
              aria-label="Close article editor"
              disabled={saving || uploading}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--admin-text-soft))",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {loadError ? (
            <div role="alert" className="admin-notice">
              <p>Couldn't load this article: {loadError}</p>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                Retry loading article
              </button>
            </div>
          ) : loading || !item ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Loader2
                className="animate-spin"
                size={22}
                style={{ color: "hsl(var(--admin-accent))" }}
              />
            </div>
          ) : (
            <fieldset
              disabled={saving || uploading}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                border: 0,
                padding: 0,
                minWidth: 0,
              }}
            >
              <LocalDraftRecoveryBanner
                recovery={recovery}
                disabled={saving || uploading}
              />
              {conflict && (
                <div className="admin-card p-4 space-y-3" role="alert">
                  <p>
                    This article changed since you opened it. Your edits are
                    still here. Compare the saved article, then load it and copy
                    across the edits you want to keep.
                  </p>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={comparing}
                    onClick={compareLatest}
                  >
                    {comparing
                      ? "Loading latest version…"
                      : "Compare latest saved version"}
                  </button>
                  {latest && (
                    <>
                      <details open>
                        <summary>Latest saved article — read only</summary>
                        <pre className="whitespace-pre-wrap break-words max-h-80 overflow-y-auto text-xs mt-3">
                          {JSON.stringify(newsDraft(latest), null, 2)}
                        </pre>
                      </details>
                      <p className="admin-help">
                        Loading replaces the form. Your current edits remain in
                        this device's working-copy backup for download and
                        comparison.
                      </p>
                      <button
                        type="button"
                        className="admin-btn-secondary"
                        onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                      >
                        Load latest saved version
                      </button>
                    </>
                  )}
                </div>
              )}
              {(item.status === "pending" || newsFeedIssue(item)) && (
                <div className="admin-card p-4" role="status">
                  <strong>Editorial review</strong>
                  <p className="admin-help mt-2">
                    {newsFeedIssue(item) ||
                      "This report is awaiting review before it appears publicly."}{" "}
                    Check the original report, write a clear English headline
                    and factual summary, then choose Published when it is ready.
                  </p>
                </div>
              )}
              <div>
                <label style={labelStyle}>Title (displayed)</label>
                <input
                  style={inputStyle}
                  value={item.ai_title || ""}
                  onChange={(e) => patch({ ai_title: e.target.value })}
                  placeholder={item.title || "Article title"}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                    marginTop: 4,
                  }}
                >
                  Original: {item.title || "—"}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Summary / excerpt</label>
                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: 70,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  value={item.ai_summary || item.raw_excerpt || ""}
                  onChange={(e) => patch({ ai_summary: e.target.value })}
                />
              </div>

              <div>
                <label style={labelStyle}>Full article content</label>
                <textarea
                  aria-label="Full article content"
                  style={{
                    ...inputStyle,
                    minHeight: 240,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  value={item.full_content || ""}
                  onChange={(event) =>
                    patch({ full_content: event.target.value })
                  }
                  placeholder="Write a factual briefing. Use ## for headings and [source](https://…) for links."
                />
                <p className="admin-help mt-2">
                  Use Markdown headings and links. Keep claims tied to the
                  source; distinguish reporting from interpretation. Do not
                  attribute an opinion to the site owner unless they supplied
                  it.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Featured image</label>
                {item.image_url ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <img
                      src={item.image_url}
                      alt="preview"
                      style={{
                        width: 220,
                        height: 130,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid hsl(var(--admin-border))",
                      }}
                    />
                    <button
                      onClick={() => patch({ image_url: null })}
                      style={{
                        padding: "6px 10px",
                        background: "transparent",
                        border: "1px solid hsl(var(--admin-danger))",
                        borderRadius: 6,
                        color: "hsl(var(--admin-danger))",
                        cursor: "pointer",
                        fontSize: 12,
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <ImageOff size={12} /> Remove
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 20,
                      border: "1px dashed hsl(var(--admin-border))",
                      borderRadius: 6,
                      textAlign: "center",
                      color: "hsl(var(--admin-text-ghost))",
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  >
                    No image set.
                  </div>
                )}
                <input
                  style={{ ...inputStyle, marginBottom: 8 }}
                  placeholder="https://…"
                  value={item.image_url || ""}
                  onChange={(e) => patch({ image_url: e.target.value })}
                />
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    background: "transparent",
                    border: "1px solid hsl(var(--admin-border))",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    color: "hsl(var(--admin-text-soft))",
                  }}
                >
                  {uploading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Upload size={12} />
                  )}
                  Upload new image
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <label style={labelStyle}>Collection feed</label>
                  <input
                    style={{ ...inputStyle, opacity: 0.7 }}
                    value={sourceName}
                    disabled
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--admin-text-ghost))",
                      marginTop: 4,
                    }}
                  >
                    Public attribution uses the linked website:{" "}
                    {newsSourceLabel(item)}. The collection feed is managed in
                    Sources.
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Author</label>
                  <input
                    style={inputStyle}
                    value={item.author || ""}
                    onChange={(e) => patch({ author: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Source URL</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={inputStyle}
                      value={item.url}
                      onChange={(e) => patch({ url: e.target.value })}
                    />
                    <a
                      href={safeHref(item.url) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "8px 10px",
                        background: "transparent",
                        border: "1px solid hsl(var(--admin-border))",
                        borderRadius: 6,
                        color: "hsl(var(--admin-text-soft))",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Category (topic lane)</label>
                  <select
                    style={inputStyle}
                    value={item.topic_lane || ""}
                    onChange={(e) =>
                      patch({ topic_lane: e.target.value || null })
                    }
                  >
                    <option value="">— none —</option>
                    {LANES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                    {item.topic_lane && !LANES.includes(item.topic_lane) && (
                      <option value={item.topic_lane}>{item.topic_lane}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    style={inputStyle}
                    value={item.status}
                    onChange={(e) => patch({ status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {!STATUSES.includes(item.status) && (
                      <option value={item.status}>{item.status}</option>
                    )}
                  </select>
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--admin-text-ghost))",
                      marginTop: 4,
                    }}
                  >
                    Only <strong>published</strong> items can appear publicly.
                    The listing also excludes repeated stories and entries that
                    fail the headline or business-relevance checks. Existing
                    published article URLs remain accessible.
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Publication date</label>
                  <input
                    type="datetime-local"
                    aria-label="Publication date"
                    style={inputStyle}
                    value={
                      item.published_at
                        ? zonedInput(item.published_at, timezone)
                        : ""
                    }
                    onChange={(e) => {
                      try {
                        patch({
                          published_at: e.target.value
                            ? scheduledInstant(e.target.value, timezone)
                            : null,
                        });
                      } catch (error) {
                        toast({
                          title: "Choose a valid publication time",
                          description: errorMessage(error),
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                  <p className="admin-help mt-1">Your timezone: {timezone}</p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 16,
                  borderTop: "1px solid hsl(var(--admin-border))",
                }}
              >
                <button
                  onClick={requestClose}
                  style={{
                    padding: "10px 16px",
                    background: "transparent",
                    border: "1px solid hsl(var(--admin-border))",
                    borderRadius: 6,
                    color: "hsl(var(--admin-text-soft))",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || uploading || conflict}
                  style={{
                    padding: "10px 18px",
                    background: "hsl(var(--admin-accent))",
                    border: "none",
                    borderRadius: 6,
                    color: "#1a1208",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Save changes
                </button>
              </div>
            </fieldset>
          )}
        </div>
      </div>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard article changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits have not been saved. Keep editing to finish or save
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                recovery.clearSaved(newsDraft(item));
                onClose();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
