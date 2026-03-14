import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import RichTextEditor from "./RichTextEditor";
import PostEditorSidebar from "./PostEditorSidebar";
import PostEditorAiHelper from "./PostEditorAiHelper";
import PostEditorAeoPanel from "./PostEditorAeoPanel";
import PostEditorSeoPanel from "./PostEditorSeoPanel";
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";

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

  // Core state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState(() => localStorage.getItem("admin-timezone") || "America/New_York");
  const [featuredImage, setFeaturedImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [editorContent, setEditorContent] = useState("");

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
  const [faqItems, setFaqItems] = useState<FaqItem[]>([{ question: "", answer: "" }]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Queries
  const { data: post, isLoading: postLoading } = useQuery({
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

  // Sync post data
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

  // Handlers
  const handleFeaturedUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [toast]);

  // FAQ & takeaway helpers
  const addFaq = useCallback(() => setFaqItems(prev => [...prev, { question: "", answer: "" }]), []);
  const removeFaq = useCallback((i: number) => setFaqItems(prev => prev.filter((_, idx) => idx !== i)), []);
  const updateFaq = useCallback((i: number, field: keyof FaqItem, val: string) => {
    setFaqItems(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u; });
  }, []);
  const addTakeaway = useCallback(() => setKeyTakeaways(prev => [...prev, ""]), []);
  const removeTakeaway = useCallback((i: number) => setKeyTakeaways(prev => prev.filter((_, idx) => idx !== i)), []);
  const updateTakeaway = useCallback((i: number, val: string) => {
    setKeyTakeaways(prev => { const u = [...prev]; u[i] = val; return u; });
  }, []);

  // Scoring
  const currentContent = editorRef.current?.getHTML() ?? editorContent;

  const seoScore = useMemo(() => {
    let s = 0;
    if (metaTitle && metaTitle.length <= 60) s++;
    if (metaDesc && metaDesc.length <= 160) s++;
    if (keywords) s++;
    if (featuredImage || ogImage) s++;
    return s;
  }, [metaTitle, metaDesc, keywords, featuredImage, ogImage]);

  const aeoScore = useMemo(() => {
    let s = 0;
    if (tldr && tldr.length >= 20) s++;
    if (faqItems.filter(f => f.question.trim() && f.answer.trim()).length >= 2) s++;
    if (keyTakeaways.filter(t => t.trim()).length >= 3) s++;
    if (/<h[23][^>]*>.*\?.*<\/h[23]>/i.test(currentContent)) s++;
    if (/<(ul|ol)[^>]*>/i.test(currentContent)) s++;
    if (wordCount(currentContent) >= 800) s++;
    return s;
  }, [tldr, faqItems, keyTakeaways, currentContent]);

  const criteria = useMemo(() => {
    const validFaq = faqItems.filter(f => f.question.trim() && f.answer.trim());
    const validTakeaways = keyTakeaways.filter(t => t.trim());
    return [
      { label: "TL;DR summary (20+ chars)", done: !!(tldr && tldr.length >= 20), points: "+8", category: "AEO" },
      { label: "2+ FAQ items", done: validFaq.length >= 2, points: "+8", category: "AEO" },
      { label: "3+ key takeaways", done: validTakeaways.length >= 3, points: "+8", category: "AEO" },
      { label: "Question headings (H2/H3 with ?)", done: /<h[23][^>]*>.*\?.*<\/h[23]>/i.test(currentContent), points: "+8", category: "AEO" },
      { label: "Lists in content (ul/ol)", done: /<(ul|ol)[^>]*>/i.test(currentContent), points: "+8", category: "AEO" },
      { label: "800+ words", done: wordCount(currentContent) >= 800, points: "+8", category: "AEO" },
      { label: "Meta title (≤60 chars)", done: !!(metaTitle && metaTitle.length <= 60), points: "+13", category: "SEO" },
      { label: "Meta description (≤160 chars)", done: !!(metaDesc && metaDesc.length <= 160), points: "+13", category: "SEO" },
      { label: "Keywords added", done: !!keywords, points: "+12", category: "SEO" },
      { label: "Featured or OG image", done: !!(featuredImage || ogImage), points: "+12", category: "SEO" },
    ];
  }, [tldr, faqItems, keyTakeaways, currentContent, metaTitle, metaDesc, keywords, featuredImage, ogImage]);

  const aeoTips = useMemo(() => {
    const tips: string[] = [];
    if (!tldr || tldr.length < 20) tips.push("Add a TL;DR summary (20+ chars) — LLMs often pull this as the answer");
    if (faqItems.filter(f => f.question.trim() && f.answer.trim()).length < 2) tips.push("Add 2+ FAQ items — these generate FAQ schema for AI search");
    if (keyTakeaways.filter(t => t.trim()).length < 3) tips.push("Add 3+ key takeaways — bullet-point answers rank in AI overviews");
    if (!/<h[23][^>]*>.*\?.*<\/h[23]>/i.test(currentContent)) tips.push("Use question-format headings (H2/H3 with ?) — LLMs match these to queries");
    if (!/<(ul|ol)[^>]*>/i.test(currentContent)) tips.push("Add lists to your content — structured data is easier for LLMs to cite");
    if (wordCount(currentContent) < 800) tips.push("Write 800+ words — comprehensive content is cited more by AI");
    return tips;
  }, [tldr, faqItems, keyTakeaways, currentContent]);

  const scoreColor = (score: number, max: number) =>
    score >= max * 0.66 ? "admin-sage" : "admin-accent";

  // AI generation
  const handleAiGenerate = useCallback(async () => {
    const content = editorRef.current?.getHTML() ?? editorContent;
    if (!title && !content) {
      toast({ title: "Need content", description: "Add a title or some content first.", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-seo-aeo", { body: { title, content, excerpt } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.tldr) setTldr(data.tldr);
      if (data.key_takeaways?.length) setKeyTakeaways(data.key_takeaways);
      if (data.faq_items?.length) setFaqItems(data.faq_items);
      if (data.excerpt) setExcerpt(data.excerpt);
      if (data.meta_title) setMetaTitle(data.meta_title);
      if (data.meta_description) setMetaDesc(data.meta_description);
      if (data.keywords) setKeywords(data.keywords);
      setAeoOpen(true);
      setSeoOpen(true);
      setHasGenerated(true);
      toast({ title: "AI Generated!", description: "All SEO & AEO/GEO fields have been filled." });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  }, [title, editorContent, excerpt, toast]);

  const handleEnhance = useCallback(async () => {
    const content = editorRef.current?.getHTML() ?? editorContent;
    const missing = criteria.filter(c => !c.done).map(c => c.label);
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
      toast({ title: "Enhancement failed", description: e.message, variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  }, [title, editorContent, excerpt, criteria, toast]);

  // Save
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
        keywords: keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : null,
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

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    if (post?.content) editor.commands.setContent(post.content);
  }, [post]);

  if (!isNew && postLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 64 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>
          {isNew ? "New Post" : "Edit Post"}
        </h1>
        <div className="flex gap-3">
          <button onClick={() => navigate("/admin/posts")} className="admin-btn-ghost">Cancel</button>
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
          <RichTextEditor
            content={editorContent}
            onChange={(html) => setEditorContent(html)}
            onEditorReady={handleEditorReady}
          />
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-5">
          <PostEditorSidebar
            status={status} setStatus={setStatus}
            timezone={timezone} setTimezone={setTimezone}
            scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}
            categoryId={categoryId} setCategoryId={setCategoryId}
            categories={categories ?? []}
            featuredImage={featuredImage} setFeaturedImage={setFeaturedImage}
            uploading={uploading} onFeaturedUpload={handleFeaturedUpload}
            excerpt={excerpt} setExcerpt={setExcerpt}
          />

          <PostEditorAiHelper
            aeoScore={aeoScore}
            seoScore={seoScore}
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
              style={{ padding: 20, background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-soft))" }}
            >
              <span className="flex items-center gap-2">
                <Sparkles size={14} style={{ color: "hsl(var(--admin-accent))" }} />
                <span className="admin-label" style={{ marginBottom: 0 }}>AEO / GEO</span>
                <span className="admin-badge" style={{ background: `hsl(var(--${scoreColor(aeoScore, 6)}-soft))`, color: `hsl(var(--${scoreColor(aeoScore, 6)}))` }}>
                  {aeoScore}/6
                </span>
              </span>
              {aeoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {aeoOpen && (
              <PostEditorAeoPanel
                tldr={tldr} setTldr={setTldr}
                keyTakeaways={keyTakeaways} faqItems={faqItems}
                addTakeaway={addTakeaway} removeTakeaway={removeTakeaway} updateTakeaway={updateTakeaway}
                addFaq={addFaq} removeFaq={removeFaq} updateFaq={updateFaq}
                aeoTips={aeoTips}
              />
            )}
          </div>

          {/* SEO Panel */}
          <div className="admin-card">
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="font-body w-full flex items-center justify-between"
              style={{ padding: 20, background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-soft))" }}
            >
              <span className="flex items-center gap-2">
                <span className="admin-label" style={{ marginBottom: 0 }}>SEO</span>
                <span className="admin-badge" style={{ background: `hsl(var(--${scoreColor(seoScore, 4)}-soft))`, color: `hsl(var(--${scoreColor(seoScore, 4)}))` }}>
                  {seoScore}/4
                </span>
              </span>
              {seoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {seoOpen && (
              <PostEditorSeoPanel
                metaTitle={metaTitle} setMetaTitle={setMetaTitle}
                metaDesc={metaDesc} setMetaDesc={setMetaDesc}
                keywords={keywords} setKeywords={setKeywords}
                ogImage={ogImage} setOgImage={setOgImage}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostEditor;
