interface PostEditorSeoPanelProps {
  metaTitle: string;
  setMetaTitle: (v: string) => void;
  metaDesc: string;
  setMetaDesc: (v: string) => void;
  keywords: string;
  setKeywords: (v: string) => void;
  ogImage: string;
  setOgImage: (v: string) => void;
}

const PostEditorSeoPanel = ({
  metaTitle, setMetaTitle,
  metaDesc, setMetaDesc,
  keywords, setKeywords,
  ogImage, setOgImage,
}: PostEditorSeoPanelProps) => (
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
);

export default PostEditorSeoPanel;
