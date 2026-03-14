import React from "react";

interface PostEditorSidebarProps {
  status: string;
  setStatus: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  categories: Array<{ id: string; name: string }>;
  featuredImage: string;
  setFeaturedImage: (v: string) => void;
  uploading: boolean;
  onFeaturedUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  excerpt: string;
  setExcerpt: (v: string) => void;
}

const PostEditorSidebar = ({
  status, setStatus,
  timezone, setTimezone,
  scheduledAt, setScheduledAt,
  categoryId, setCategoryId, categories,
  featuredImage, setFeaturedImage,
  uploading, onFeaturedUpload,
  excerpt, setExcerpt,
}: PostEditorSidebarProps) => (
  <>
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

    {/* Featured Image */}
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
        <input type="file" accept="image/*" onChange={onFeaturedUpload} className="hidden" />
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
  </>
);

export default PostEditorSidebar;
