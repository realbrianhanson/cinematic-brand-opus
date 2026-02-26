import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import RichTextEditor from "./RichTextEditor";
import {
  ChevronDown, ChevronUp, Plus,
  Trash2, Sparkles, Wand2, Loader2,
} from "lucide-react";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const wordCount = (html: string) => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
};

interface FaqItem { question: string; answer: string; }

const PostEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !id;
  const editorRef = useRef<Editor | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState(() => {
    const saved = localStorage.getItem("admin-timezone");
    return saved || "America/New_York";
  });
  const [featuredImage, setFeaturedImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [editorContent, setEditorContent] = useState("");

  // AEO/GEO state
  const [aeoOpen, setAeoOpen] = useState(false);
  const [tldr, setTldr] = useState("");
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([""]);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([{ question: "", answer: "" }]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const scoreRef = useRef<HTMLDivElement>(null);

  const { data: post } = useQuery({
    queryKey: ["admin-post", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: seo } = useQuery({
    queryKey: ["admin-seo", id],
    queryFn: async () => {
      const { data } = await supabase.from("seo_metadata").select("*").eq("post_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories-list"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt ?? "");
      setCategoryId(post.category_id ?? "");
      setStatus(post.status);
      setScheduledAt((post as any).scheduled_at ? new Date((post as any).scheduled_at).toISOString().slice(0, 16) : "");
      setFeaturedImage(post.featured_image ?? "");
      setSlugManual(true);
      setTldr((post as any).tldr ?? "");
      setKeyTakeaways((post as any).key_takeaways?.length ? (post as any).key_takeaways : [""]);
      setFaqItems((post as any).faq_items?.length ? (post as any).faq_items : [{ question: "", answer: "" }]);
      if (editorRef.current && post.content) {
        editorRef.current.commands.setContent(post.content);
      }
      setEditorContent(post.content ?? "");
    }
  }, [post]);

  useEffect(() => {
    if (seo) {
      setMetaTitle(seo.meta_title ?? "");
      setMetaDesc(seo.meta_description ?? "");
      setKeywords((seo.keywords ?? []).join(", "));
      setOgImage(seo.og_image ?? "");
    }
  }, [seo]);

  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  const handleFeaturedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("blog-images").upload(path, file);
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("blog-images").getPublicUrl(path);
    setFeaturedImage(urlData.publicUrl);
    setUploading(false);
  };

  // FAQ helpers
  const addFaq = () => setFaqItems([...faqItems, { question: "", answer: "" }]);
  const removeFaq = (i: number) => setFaqItems(faqItems.filter((_, idx) => idx !== i));
  const updateFaq = (i: number, field: keyof FaqItem, val: string) => {
    const updated = [...faqItems];
    updated[i] = { ...updated[i], [field]: val };
    setFaqItems(updated);
  };

  // Takeaways helpers
  const addTakeaway = () => setKeyTakeaways([...keyTakeaways, ""]);
  const removeTakeaway = (i: number) => setKeyTakeaways(keyTakeaways.filter((_, idx) => idx !== i));
  const updateTakeaway = (i: number, val: string) => {
    const updated = [...keyTakeaways];
    updated[i] = val;
    setKeyTakeaways(updated);
  };

  const handleAiGenerate = async () => {
    const content = editorRef.current?.getHTML() ?? editorContent;
    if (!title && !content) {
      toast({ title: "Need content", description: "Add a title or some content first.", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-seo-aeo", {
        body: { title, content, excerpt },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Fill AEO/GEO fields
      if (data.tldr) setTldr(data.tldr);
      if (data.key_takeaways?.length) setKeyTakeaways(data.key_takeaways);
      if (data.faq_items?.length) setFaqItems(data.faq_items);
      if (data.excerpt) setExcerpt(data.excerpt);

      // Fill SEO fields
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);

      setAeoOpen(true);
      setSeoOpen(true);
      setHasGenerated(true);
      toast({ title: "AI Generated!", description: "All SEO & AEO/GEO fields have been filled." });
    } catch (e: any) {
      console.error("AI generation error:", e);
      toast({ title: "Generation failed", description: e.message || "Something went wrong", variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const [enhancing, setEnhancing] = useState(false);

  const getMissingCriteria = () => {
    const content = editorRef.current?.getHTML() ?? editorContent;
    const validFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
    const validTakeaways = keyTakeaways.filter(t => t.trim());
    const missing: string[] = [];
    if (!tldr || tldr.length < 20) missing.push("TL;DR summary (20+ chars)");
    if (validFaq.length < 2) missing.push("Need 2+ FAQ items with question and answer");
    if (validTakeaways.length < 3) missing.push("Need 3+ key takeaways");
    if (!/<h[23][^>]*>.*\?.*<\/h[23]>/i.test(content)) missing.push("Add question-format H2/H3 headings with ? in the content");
    if (!/<(ul|ol)[^>]*>/i.test(content)) missing.push("Add bulleted or numbered lists in the content");
    if (wordCount(content) < 800) missing.push(`Content needs more words (currently ${wordCount(content)}, need 800+)`);
    if (!metaTitle || metaTitle.length > 60) missing.push("Meta title under 60 characters");
    if (!metaDesc || metaDesc.length > 160) missing.push("Meta description under 160 characters");
    if (!keywords) missing.push("Add SEO keywords");
    if (!featuredImage && !ogImage) missing.push("Add a featured image or OG image");
    return missing;
  };

  const handleIncreaseScore = async () => {
    const content = editorRef.current?.getHTML() ?? editorContent;
    const missing = getMissingCriteria();
    if (missing.length === 0) {
      toast({ title: "Perfect score! 🎉", description: "All criteria are already met." });
      return;
    }
    setEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-seo-aeo", {
        body: { title, content, excerpt, enhance: true, missing_criteria: missing },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.tldr) setTldr(data.tldr);
      if (data.key_takeaways?.length) setKeyTakeaways(data.key_takeaways);
      if (data.faq_items?.length) setFaqItems(data.faq_items);
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);
      if (data.enhanced_content && editorRef.current) {
        editorRef.current.commands.setContent(data.enhanced_content);
        setEditorContent(data.enhanced_content);
      }

      setAeoOpen(true);
      setSeoOpen(true);
      toast({ title: "Score boosted! 🚀", description: "Missing criteria have been filled by AI." });
    } catch (e: any) {
      console.error("Enhance error:", e);
      toast({ title: "Enhancement failed", description: e.message || "Something went wrong", variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const content = editorRef.current?.getHTML() ?? editorContent;
      const reading_time = Math.max(1, Math.round(wordCount(content) / 200));

      const cleanFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
      const cleanTakeaways = keyTakeaways.filter(t => t.trim());

      const postData: Record<string, any> = {
        title, slug, content,
        excerpt: excerpt || null,
        category_id: categoryId || null,
        status,
        scheduled_at: status === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        featured_image: featuredImage || null,
        reading_time,
        faq_items: cleanFaq.length ? cleanFaq : [],
        key_takeaways: cleanTakeaways.length ? cleanTakeaways : [],
        tldr: tldr || null,
      };

      let postId = id;
      if (isNew) {
        const { data, error } = await supabase.from("posts").insert(postData as any).select("id").single();
        if (error) throw error;
        postId = data.id;
      } else {
        const { error } = await supabase.from("posts").update(postData as any).eq("id", id!);
        if (error) throw error;
      }

      const seoData = {
        post_id: postId!,
        meta_title: metaTitle || null,
        meta_description: metaDesc || null,
        keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : null,
        og_image: ogImage || null,
      };

      if (seo?.id) {
        await supabase.from("seo_metadata").update(seoData).eq("id", seo.id);
      } else {
        await supabase.from("seo_metadata").insert(seoData);
      }

      return postId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      navigate("/admin/posts");
    },
  });

  const seoScore = () => {
    let score = 0;
    if (metaTitle && metaTitle.length <= 60) score++;
    if (metaDesc && metaDesc.length <= 160) score++;
    if (keywords) score++;
    if (featuredImage || ogImage) score++;
    return score;
  };

  const aeoScore = () => {
    let score = 0;
    const content = editorRef.current?.getHTML() ?? editorContent;
    if (tldr && tldr.length >= 20) score++;
    const validFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
    if (validFaq.length >= 2) score++;
    const validTakeaways = keyTakeaways.filter(t => t.trim());
    if (validTakeaways.length >= 3) score++;
    if (/<h[23][^>]*>.*\?.*<\/h[23]>/i.test(content)) score++;
    if (/<(ul|ol)[^>]*>/i.test(content)) score++;
    if (wordCount(content) >= 800) score++;
    return score;
  };

  const aeoTips = () => {
    const tips: string[] = [];
    const content = editorRef.current?.getHTML() ?? editorContent;
    if (!tldr || tldr.length < 20) tips.push("Add a TL;DR summary (20+ chars) — LLMs often pull this as the answer");
    const validFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
    if (validFaq.length < 2) tips.push("Add 2+ FAQ items — these generate FAQ schema for AI search");
    const validTakeaways = keyTakeaways.filter(t => t.trim());
    if (validTakeaways.length < 3) tips.push("Add 3+ key takeaways — bullet-point answers rank in AI overviews");
    if (!/<h[23][^>]*>.*\?.*<\/h[23]>/i.test(content)) tips.push("Use question-format headings (H2/H3 with ?) — LLMs match these to queries");
    if (!/<(ul|ol)[^>]*>/i.test(content)) tips.push("Add lists to your content — structured data is easier for LLMs to cite");
    if (wordCount(content) < 800) tips.push("Write 800+ words — comprehensive content is cited more by AI");
    return tips;
  };

  const seoTips = () => {
    const tips: string[] = [];
    if (!metaTitle) tips.push("Add a meta title — essential for search engine ranking");
    else if (metaTitle.length > 60) tips.push("Shorten meta title to ≤60 chars — longer titles get truncated in SERPs");
    if (!metaDesc) tips.push("Add a meta description — controls your search result snippet");
    else if (metaDesc.length > 160) tips.push("Shorten meta description to ≤160 chars — longer ones get cut off");
    if (!keywords) tips.push("Add keywords — helps search engines understand your content topics");
    if (!featuredImage && !ogImage) tips.push("Add a featured or OG image — visual results get higher click-through rates");
    return tips;
  };

  const allTips = () => [...aeoTips(), ...seoTips()];

  const scoreColor = (score: number, max: number) =>
    score >= max * 0.66 ? "admin-sage" : "admin-accent";

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    // If post data loaded before editor was ready, set content now
    if (post?.content) {
      editor.commands.setContent(post.content);
    }
  }, [post]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>
          {isNew ? "New Post" : "Edit Post"}
        </h1>
        <div className="flex gap-3">
          <button onClick={() => navigate("/admin/posts")} className="admin-btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !title || !slug}
            className="admin-btn-primary"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <input
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="admin-input font-heading"
            style={{ fontSize: 26, fontWeight: 400, padding: "16px 20px", borderRadius: 6 }}
          />

          <div className="flex items-center gap-2">
            <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>/blog/</span>
            <input
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              className="admin-input font-body flex-1"
            />
          </div>

          {/* Rich Text Editor */}
          <RichTextEditor
            content={editorContent}
            onChange={(html) => setEditorContent(html)}
            onEditorReady={handleEditorReady}
          />
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          {/* Status */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="admin-input font-body w-full"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>

            {status === "scheduled" && (
              <div style={{ marginTop: 12 }}>
                <label className="admin-label" style={{ fontSize: 10 }}>Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    localStorage.setItem("admin-timezone", e.target.value);
                  }}
                  className="admin-input font-body w-full"
                  style={{ marginBottom: 10 }}
                >
                  <optgroup label="United States">
                    <option value="America/New_York">🇺🇸 Eastern (ET)</option>
                    <option value="America/Chicago">🇺🇸 Central (CT)</option>
                    <option value="America/Denver">🇺🇸 Mountain (MT)</option>
                    <option value="America/Los_Angeles">🇺🇸 Pacific (PT)</option>
                    <option value="America/Anchorage">🇺🇸 Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">🇺🇸 Hawaii (HT)</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">🇬🇧 London (GMT/BST)</option>
                    <option value="Europe/Paris">🇫🇷 Paris (CET)</option>
                    <option value="Europe/Berlin">🇩🇪 Berlin (CET)</option>
                    <option value="Europe/Moscow">🇷🇺 Moscow (MSK)</option>
                  </optgroup>
                  <optgroup label="Asia">
                    <option value="Asia/Dubai">🇦🇪 Dubai (GST)</option>
                    <option value="Asia/Kolkata">🇮🇳 India (IST)</option>
                    <option value="Asia/Shanghai">🇨🇳 China (CST)</option>
                    <option value="Asia/Tokyo">🇯🇵 Tokyo (JST)</option>
                    <option value="Asia/Seoul">🇰🇷 Seoul (KST)</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="Australia/Sydney">🇦🇺 Sydney (AEST)</option>
                    <option value="Pacific/Auckland">🇳🇿 Auckland (NZST)</option>
                    <option value="America/Sao_Paulo">🇧🇷 São Paulo (BRT)</option>
                  </optgroup>
                </select>

                <label className="admin-label" style={{ fontSize: 10 }}>Publish Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date().toLocaleString("sv-SE", { timeZone: timezone }).slice(0, 16)}
                  className="admin-input font-body w-full"
                  style={{ colorScheme: "dark" }}
                />
                {scheduledAt && (
                  <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", marginTop: 6 }}>
                    Will publish on {new Date(scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timezone, timeZoneName: "short" })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="admin-input font-body w-full"
            >
              <option value="">No category</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Featured image */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Featured Image</label>
            {featuredImage && (
              <div className="relative" style={{ marginBottom: 12 }}>
                <img src={featuredImage} alt="" style={{ width: "100%", borderRadius: 4, aspectRatio: "16/9", objectFit: "cover" }} />
                <button
                  onClick={() => setFeaturedImage("")}
                  style={{
                    position: "absolute", top: 6, right: 6,
                    backgroundColor: "rgba(0,0,0,0.6)", color: "#FFF",
                    border: "none", borderRadius: "50%", width: 22, height: 22,
                    cursor: "pointer", fontSize: 11,
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <label
              className="font-body block text-center cursor-pointer"
              style={{
                fontSize: 12,
                color: "hsl(var(--admin-accent))",
                padding: 12,
                border: "1px dashed hsl(var(--admin-border))",
                borderRadius: 4,
              }}
            >
              {uploading ? "Uploading..." : "Upload Image"}
              <input type="file" accept="image/*" onChange={handleFeaturedUpload} className="hidden" />
            </label>
          </div>

          {/* Excerpt */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="admin-input font-body w-full"
              style={{ resize: "vertical" as const }}
              placeholder="Brief post summary..."
            />
          </div>

          {/* AI Helper */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <Wand2 size={14} style={{ color: "hsl(var(--admin-accent))" }} />
              <span className="admin-label" style={{ marginBottom: 0 }}>AI Helper</span>
            </div>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginBottom: 14, lineHeight: 1.5 }}>
              Generate all AEO/GEO &amp; SEO fields in one click based on your post content.
            </p>

            {/* Overall Score */}
            {(() => {
              const overall = Math.round(((aeoScore() / 6) * 50) + ((seoScore() / 4) * 50));
              const overallColor = overall >= 75 ? "admin-sage" : overall >= 40 ? "admin-accent" : "admin-danger";
              return (
                <div style={{ marginBottom: 16, textAlign: "center" }}>
                  <div style={{
                    position: "relative", width: 100, height: 100, margin: "0 auto 10px",
                  }}>
                    <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--admin-surface-2))" strokeWidth="2.8" />
                      <circle cx="18" cy="18" r="15.9" fill="none"
                        stroke={`hsl(var(--${overallColor}))`}
                        strokeWidth="2.8"
                        strokeDasharray={`${overall} ${100 - overall}`}
                        strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 0.5s ease" }}
                      />
                    </svg>
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <span className="font-heading" style={{ fontSize: 24, color: `hsl(var(--${overallColor}))`, lineHeight: 1 }}>{overall}</span>
                      <span className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))" }}>/ 100</span>
                    </div>
                  </div>
                  <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Overall Score
                  </p>
                </div>
              );
            })()}

            {/* Score breakdown */}
            <div className="flex gap-3" style={{ marginBottom: 14 }}>
              <div style={{ flex: 1, backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                <p className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>AEO/GEO</p>
                <span className="font-heading" style={{ fontSize: 20, color: `hsl(var(--${scoreColor(aeoScore(), 6)}))` }}>{aeoScore()}</span>
                <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>/6</span>
              </div>
              <div style={{ flex: 1, backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
                <p className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>SEO</p>
                <span className="font-heading" style={{ fontSize: 20, color: `hsl(var(--${scoreColor(seoScore(), 4)}))` }}>{seoScore()}</span>
                <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>/4</span>
              </div>
            </div>

            {/* Score Increase Checklist */}
            <div ref={scoreRef} style={{ marginBottom: 14 }}>
              <p className="admin-label" style={{ marginBottom: 10, fontSize: 10 }}>
                📈 Increase Your Score
              </p>
              {(() => {
                const content = editorRef.current?.getHTML() ?? editorContent;
                const validFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
                const validTakeaways = keyTakeaways.filter(t => t.trim());
                const criteria = [
                  { label: "TL;DR summary (20+ chars)", done: !!(tldr && tldr.length >= 20), points: "+8", category: "AEO" },
                  { label: "2+ FAQ items", done: validFaq.length >= 2, points: "+8", category: "AEO" },
                  { label: "3+ key takeaways", done: validTakeaways.length >= 3, points: "+8", category: "AEO" },
                  { label: "Question headings (H2/H3 with ?)", done: /<h[23][^>]*>.*\?.*<\/h[23]>/i.test(content), points: "+8", category: "AEO" },
                  { label: "Lists in content (ul/ol)", done: /<(ul|ol)[^>]*>/i.test(content), points: "+8", category: "AEO" },
                  { label: "800+ words", done: wordCount(content) >= 800, points: "+8", category: "AEO" },
                  { label: "Meta title (≤60 chars)", done: !!(metaTitle && metaTitle.length <= 60), points: "+13", category: "SEO" },
                  { label: "Meta description (≤160 chars)", done: !!(metaDesc && metaDesc.length <= 160), points: "+13", category: "SEO" },
                  { label: "Keywords added", done: !!keywords, points: "+12", category: "SEO" },
                  { label: "Featured or OG image", done: !!(featuredImage || ogImage), points: "+12", category: "SEO" },
                ];
                const done = criteria.filter(c => c.done).length;
                const total = criteria.length;
                return (
                  <>
                    <div style={{ backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 6, padding: "4px", marginBottom: 10 }}>
                      <div style={{
                        height: 6, borderRadius: 3,
                        background: done === total
                          ? "hsl(var(--admin-sage))"
                          : "linear-gradient(90deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
                        width: `${(done / total) * 100}%`,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", marginBottom: 10, textAlign: "right" }}>
                      {done}/{total} completed
                    </p>
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-start gap-2" style={{ marginBottom: 6 }}>
                        <span style={{
                          fontSize: 13, lineHeight: "18px", flexShrink: 0,
                          color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))",
                        }}>
                          {c.done ? "✓" : "○"}
                        </span>
                        <span className="font-body" style={{
                          fontSize: 11, lineHeight: "18px", flex: 1,
                          color: c.done ? "hsl(var(--admin-text-ghost))" : "hsl(var(--admin-text-soft))",
                          textDecoration: c.done ? "line-through" : "none",
                        }}>
                          {c.label}
                        </span>
                        <span className="font-body" style={{
                          fontSize: 9, lineHeight: "18px",
                          color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-accent))",
                          fontWeight: 600,
                        }}>
                          {c.done ? "✓" : c.points}
                        </span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            <button
              onClick={handleAiGenerate}
              disabled={aiGenerating || (!title && !editorContent)}
              className="admin-btn-primary w-full flex items-center justify-center gap-2"
              style={{ fontSize: 13 }}
            >
              {aiGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate SEO &amp; AEO/GEO
                </>
              )}
            </button>

            {hasGenerated && (
              <button
                onClick={handleIncreaseScore}
                disabled={enhancing}
                className="w-full flex items-center justify-center gap-2 font-body"
                style={{
                  marginTop: 8,
                  background: enhancing
                    ? "hsl(var(--admin-surface-2))"
                    : "linear-gradient(135deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
                  color: enhancing ? "hsl(var(--admin-text-ghost))" : "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: enhancing ? "not-allowed" : "pointer",
                }}
              >
                {enhancing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Enhancing...
                  </>
                ) : (
                  <>
                    📈 Increase Score
                    <span style={{
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: 12,
                      padding: "2px 8px",
                      fontSize: 11,
                    }}>
                      {Math.round(((aeoScore() / 6) * 50) + ((seoScore() / 4) * 50))}%
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* AEO/GEO Panel */}
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
                <Sparkles size={14} style={{ color: "hsl(var(--admin-accent))" }} />
                <span className="admin-label" style={{ marginBottom: 0 }}>AEO / GEO</span>
                <span
                  className="admin-badge"
                  style={{
                    background: `hsl(var(--${scoreColor(aeoScore(), 6)}-soft))`,
                    color: `hsl(var(--${scoreColor(aeoScore(), 6)}))`,
                  }}
                >
                  {aeoScore()}/6
                </span>
              </span>
              {aeoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {aeoOpen && (
              <div className="flex flex-col gap-5" style={{ padding: "0 20px 20px" }}>
                {aeoTips().length > 0 && (
                  <div style={{ backgroundColor: "hsl(var(--admin-accent-soft))", borderRadius: 4, padding: 14 }}>
                    <p className="admin-label" style={{ color: "hsl(var(--admin-accent))", marginBottom: 8 }}>Optimization Tips</p>
                    {aeoTips().map((tip, i) => (
                      <p key={i} className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", lineHeight: 1.6, marginBottom: 4 }}>• {tip}</p>
                    ))}
                  </div>
                )}

                <div>
                  <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>
                    TL;DR Summary
                    <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Shown at top · LLMs cite this</span>
                  </label>
                  <textarea
                    value={tldr}
                    onChange={(e) => setTldr(e.target.value)}
                    rows={3}
                    className="admin-input font-body w-full"
                    style={{ resize: "vertical" as const }}
                    placeholder="In 1-2 sentences, what's the core answer?"
                  />
                </div>

                <div>
                  <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 8 }}>
                    Key Takeaways
                    <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Bullet points for AI overviews</span>
                  </label>
                  {keyTakeaways.map((t, i) => (
                    <div key={i} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                      <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-accent))", minWidth: 16 }}>{i + 1}.</span>
                      <input
                        value={t}
                        onChange={(e) => updateTakeaway(i, e.target.value)}
                        className="admin-input font-body flex-1"
                        placeholder="Key insight or actionable point"
                      />
                      {keyTakeaways.length > 1 && (
                        <button
                          onClick={() => removeTakeaway(i)}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", padding: 4 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addTakeaway}
                    className="font-body flex items-center gap-1"
                    style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
                  >
                    <Plus size={12} /> Add takeaway
                  </button>
                </div>

                <div>
                  <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 8 }}>
                    FAQ Schema
                    <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Generates FAQPage JSON-LD</span>
                  </label>
                  {faqItems.map((faq, i) => (
                    <div key={i} style={{ backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                        <span className="admin-label" style={{ marginBottom: 0 }}>Q{i + 1}</span>
                        {faqItems.length > 1 && (
                          <button
                            onClick={() => removeFaq(i)}
                            style={{ border: "none", background: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", padding: 2 }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      <input
                        value={faq.question}
                        onChange={(e) => updateFaq(i, "question", e.target.value)}
                        className="admin-input font-body w-full"
                        style={{ marginBottom: 6 }}
                        placeholder="What question does this answer?"
                      />
                      <textarea
                        value={faq.answer}
                        onChange={(e) => updateFaq(i, "answer", e.target.value)}
                        rows={2}
                        className="admin-input font-body w-full"
                        style={{ resize: "vertical" as const }}
                        placeholder="Concise, direct answer (2-3 sentences)"
                      />
                    </div>
                  ))}
                  <button
                    onClick={addFaq}
                    className="font-body flex items-center gap-1"
                    style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
                  >
                    <Plus size={12} /> Add FAQ
                  </button>
                </div>
              </div>
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
                <span className="admin-label" style={{ marginBottom: 0 }}>SEO</span>
                <span
                  className="admin-badge"
                  style={{
                    background: `hsl(var(--${scoreColor(seoScore(), 4)}-soft))`,
                    color: `hsl(var(--${scoreColor(seoScore(), 4)}))`,
                  }}
                >
                  {seoScore()}/4
                </span>
              </span>
              {seoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {seoOpen && (
              <div className="flex flex-col gap-4" style={{ padding: "0 20px 20px" }}>
                <div>
                  <div className="flex justify-between">
                    <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>Meta Title</label>
                    <span className="font-body" style={{ fontSize: 10, color: metaTitle.length > 60 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>{metaTitle.length}/60</span>
                  </div>
                  <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="admin-input font-body w-full" />
                </div>
                <div>
                  <div className="flex justify-between">
                    <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>Meta Description</label>
                    <span className="font-body" style={{ fontSize: 10, color: metaDesc.length > 160 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>{metaDesc.length}/160</span>
                  </div>
                  <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} rows={3} className="admin-input font-body w-full" style={{ resize: "vertical" as const }} />
                </div>
                <div>
                  <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>Keywords (comma separated)</label>
                  <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className="admin-input font-body w-full" />
                </div>
                <div>
                  <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>OG Image URL</label>
                  <input value={ogImage} onChange={(e) => setOgImage(e.target.value)} className="admin-input font-body w-full" placeholder="https://..." />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostEditor;
