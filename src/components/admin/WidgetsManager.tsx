import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown } from "lucide-react";

type Widget = {
  id: string;
  widget_slug: string;
  widget_zone: string;
  display_name: string;
  is_enabled: boolean;
  config: any;
  sort_order: number;
};

const ZONES = ["sidebar", "page", "footer"] as const;

const WidgetsManager = () => {
  const [activeTab, setActiveTab] = useState<string>("sidebar");
  const queryClient = useQueryClient();
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const { data: widgets, isLoading } = useQuery({
    queryKey: ["admin-widgets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widget_config")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Widget[];
    },
  });

  const debouncedSave = useCallback(
    (widgetId: string, updates: Partial<Widget>) => {
      if (saveTimers.current[widgetId]) clearTimeout(saveTimers.current[widgetId]);
      saveTimers.current[widgetId] = setTimeout(async () => {
        const { error } = await supabase
          .from("widget_config")
          .update(updates)
          .eq("id", widgetId);
        if (error) {
          toast({ title: "Error saving", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Saved" });
        }
        queryClient.invalidateQueries({ queryKey: ["admin-widgets"] });
      }, 500);
    },
    [queryClient]
  );

  const handleToggle = (widget: Widget) => {
    const newEnabled = !widget.is_enabled;
    queryClient.setQueryData(["admin-widgets"], (old: Widget[] | undefined) =>
      old?.map((w) => (w.id === widget.id ? { ...w, is_enabled: newEnabled } : w))
    );
    debouncedSave(widget.id, { is_enabled: newEnabled });
  };

  const handleConfigChange = (widget: Widget, newConfig: any) => {
    queryClient.setQueryData(["admin-widgets"], (old: Widget[] | undefined) =>
      old?.map((w) => (w.id === widget.id ? { ...w, config: newConfig } : w))
    );
    debouncedSave(widget.id, { config: newConfig });
  };

  const handleReorder = async (widget: Widget, direction: "up" | "down") => {
    const zoneWidgets = (widgets || [])
      .filter((w) => w.widget_zone === widget.widget_zone)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = zoneWidgets.findIndex((w) => w.id === widget.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= zoneWidgets.length) return;

    const other = zoneWidgets[swapIdx];
    await Promise.all([
      supabase.from("widget_config").update({ sort_order: other.sort_order }).eq("id", widget.id),
      supabase.from("widget_config").update({ sort_order: widget.sort_order }).eq("id", other.id),
    ]);
    queryClient.invalidateQueries({ queryKey: ["admin-widgets"] });
  };

  const zoneWidgets = (widgets || [])
    .filter((w) => w.widget_zone === activeTab)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <h1
        className="font-display italic mb-8"
        style={{ fontSize: 28, color: "hsl(var(--admin-text))" }}
      >
        Widgets
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-8" style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
        {ZONES.map((zone) => (
          <button
            key={zone}
            onClick={() => setActiveTab(zone)}
            className="font-body capitalize"
            style={{
              fontSize: 13,
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === zone ? "2px solid hsl(var(--admin-accent))" : "2px solid transparent",
              color: activeTab === zone ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))",
              cursor: "pointer",
              fontWeight: activeTab === zone ? 600 : 400,
            }}
          >
            {zone}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="font-body" style={{ color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          Loading widgets...
        </p>
      )}

      <div className="flex flex-col gap-4">
        {zoneWidgets.map((widget, idx) => (
          <WidgetCard
            key={widget.id}
            widget={widget}
            isFirst={idx === 0}
            isLast={idx === zoneWidgets.length - 1}
            onToggle={() => handleToggle(widget)}
            onConfigChange={(c) => handleConfigChange(widget, c)}
            onReorder={(dir) => handleReorder(widget, dir)}
          />
        ))}
      </div>
    </div>
  );
};

const WidgetCard = ({
  widget,
  isFirst,
  isLast,
  onToggle,
  onConfigChange,
  onReorder,
}: {
  widget: Widget;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onConfigChange: (config: any) => void;
  onReorder: (dir: "up" | "down") => void;
}) => {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "hsl(var(--admin-surface-2))",
        border: "1px solid hsl(var(--admin-border))",
        borderRadius: 6,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onReorder("up")}
              disabled={isFirst}
              style={{
                background: "none",
                border: "none",
                cursor: isFirst ? "default" : "pointer",
                color: isFirst ? "hsl(var(--admin-text-ghost))" : "hsl(var(--admin-text-soft))",
                padding: 0,
              }}
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => onReorder("down")}
              disabled={isLast}
              style={{
                background: "none",
                border: "none",
                cursor: isLast ? "default" : "pointer",
                color: isLast ? "hsl(var(--admin-text-ghost))" : "hsl(var(--admin-text-soft))",
                padding: 0,
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <div>
            <p className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
              {widget.display_name}
            </p>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
              {widget.widget_slug}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={widget.is_enabled}
            onChange={onToggle}
            className="sr-only peer"
          />
          <div
            className="w-9 h-5 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:rounded-full after:h-4 after:w-4 after:transition-all"
            style={{
              backgroundColor: widget.is_enabled ? "hsl(var(--admin-accent))" : "hsl(var(--admin-border))",
            }}
          >
            <div
              className="absolute top-[2px] rounded-full h-4 w-4 transition-transform"
              style={{
                background: "#fff",
                transform: widget.is_enabled ? "translateX(16px)" : "translateX(2px)",
              }}
            />
          </div>
        </label>
      </div>

      {widget.is_enabled && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid hsl(var(--admin-border))" }}>
          <ConfigFields widget={widget} onConfigChange={onConfigChange} />
        </div>
      )}
    </div>
  );
};

const ConfigFields = ({
  widget,
  onConfigChange,
}: {
  widget: Widget;
  onConfigChange: (config: any) => void;
}) => {
  const config = widget.config || {};
  const update = (key: string, value: any) => onConfigChange({ ...config, [key]: value });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    backgroundColor: "hsl(var(--admin-surface))",
    border: "1px solid hsl(var(--admin-border))",
    borderRadius: 4,
    color: "hsl(var(--admin-text))",
    fontFamily: "var(--font-body)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: "hsl(var(--admin-text-soft))",
    marginBottom: 4,
    display: "block",
    fontFamily: "var(--font-body)",
  };

  switch (widget.widget_slug) {
    case "sidebar-newsletter":
      return (
        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={config.title || ""} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={config.description || ""} onChange={(e) => update("description", e.target.value)} />
          </div>
        </div>
      );

    case "sidebar-recent-posts":
    case "sidebar-popular-posts":
      return (
        <div>
          <label style={labelStyle}>Number of posts</label>
          <input
            type="number"
            min={1}
            max={20}
            style={{ ...inputStyle, width: 80 }}
            value={config.count ?? 5}
            onChange={(e) => update("count", parseInt(e.target.value) || 5)}
          />
        </div>
      );

    case "sidebar-custom-html":
      return (
        <div>
          <label style={labelStyle}>HTML Content</label>
          <textarea
            rows={6}
            style={{ ...inputStyle, fontFamily: "monospace", backgroundColor: "hsl(var(--admin-surface-2))" }}
            value={config.html || ""}
            onChange={(e) => update("html", e.target.value)}
          />
        </div>
      );

    case "page-author-bio":
      return (
        <div>
          <label className="flex items-center gap-2 cursor-pointer font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
            <input
              type="checkbox"
              checked={config.show_image !== false}
              onChange={(e) => update("show_image", e.target.checked)}
            />
            Show author image
          </label>
          <p className="font-body mt-2" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
            Author data is pulled from Site Config.
          </p>
        </div>
      );

    case "page-related-posts":
      return (
        <div>
          <label style={labelStyle}>Number of related posts</label>
          <input
            type="number"
            min={1}
            max={12}
            style={{ ...inputStyle, width: 80 }}
            value={config.count ?? 3}
            onChange={(e) => update("count", parseInt(e.target.value) || 3)}
          />
        </div>
      );

    case "page-share-bar":
      return (
        <div>
          <label style={labelStyle}>Platforms</label>
          <div className="flex flex-wrap gap-3 mt-1">
            {["linkedin", "twitter", "facebook", "copy", "email"].map((p) => {
              const platforms: string[] = config.platforms || [];
              const checked = platforms.includes(p);
              return (
                <label key={p} className="flex items-center gap-1 font-body capitalize cursor-pointer" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? platforms.filter((x) => x !== p) : [...platforms, p];
                      update("platforms", next);
                    }}
                  />
                  {p === "copy" ? "Copy Link" : p}
                </label>
              );
            })}
          </div>
        </div>
      );

    case "page-toc":
      return (
        <div>
          <label style={labelStyle}>Minimum headings to show TOC</label>
          <input
            type="number"
            min={1}
            max={20}
            style={{ ...inputStyle, width: 80 }}
            value={config.min_headings ?? 3}
            onChange={(e) => update("min_headings", parseInt(e.target.value) || 3)}
          />
        </div>
      );

    case "page-reading-progress":
      return (
        <div>
          <label style={labelStyle}>Bar color</label>
          <select
            style={inputStyle}
            value={config.color || "accent"}
            onChange={(e) => update("color", e.target.value)}
          >
            <option value="accent">Accent</option>
            <option value="sage">Sage</option>
            <option value="blue">Blue</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      );

    case "footer-columns":
      return (
        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Number of columns</label>
            <div className="flex gap-3 mt-1">
              {[2, 3, 4].map((n) => (
                <label key={n} className="flex items-center gap-1 font-body cursor-pointer" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                  <input
                    type="radio"
                    name="footer-cols"
                    checked={(config.columns ?? 3) === n}
                    onChange={() => {
                      const content = config.content || [];
                      const newContent = Array.from({ length: n }, (_, i) => content[i] || {});
                      onConfigChange({ ...config, columns: n, content: newContent });
                    }}
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>
          {Array.from({ length: config.columns || 3 }).map((_, i) => {
            const col = (config.content || [])[i] || {};
            return (
              <div key={i} className="p-3" style={{ border: "1px solid hsl(var(--admin-border))", borderRadius: 4 }}>
                <label style={labelStyle}>Column {i + 1} Title</label>
                <input
                  style={inputStyle}
                  value={col.title || ""}
                  onChange={(e) => {
                    const content = [...(config.content || [])];
                    content[i] = { ...content[i], title: e.target.value };
                    onConfigChange({ ...config, content });
                  }}
                />
                <label style={{ ...labelStyle, marginTop: 8 }}>Content</label>
                <textarea
                  rows={3}
                  style={inputStyle}
                  value={col.text || ""}
                  onChange={(e) => {
                    const content = [...(config.content || [])];
                    content[i] = { ...content[i], text: e.target.value };
                    onConfigChange({ ...config, content });
                  }}
                />
              </div>
            );
          })}
        </div>
      );

    case "sidebar-categories":
    case "sidebar-social-links":
    case "page-back-to-top":
      return (
        <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
          No configuration needed — just toggle on/off.
        </p>
      );

    default:
      return null;
  }
};

export default WidgetsManager;
