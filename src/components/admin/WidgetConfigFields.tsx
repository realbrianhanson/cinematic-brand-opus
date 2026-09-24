import { useId } from "react";
import type { WidgetConfig } from "@/lib/widgetConfig";

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
  fontSize: 12,
  fontWeight: 500,
  color: "hsl(var(--admin-text-soft))",
  marginBottom: 4,
  display: "block",
  fontFamily: "var(--font-body)",
};

const helpStyle: React.CSSProperties = {
  fontSize: 12,
  color: "hsl(var(--admin-text-ghost))",
};

const SHARE_PLATFORMS = ["linkedin", "twitter", "facebook", "copy", "email"];

/** Editable settings for one widget. Controlled by the card's local draft. */
const WidgetConfigFields = ({
  slug,
  config,
  onChange,
}: {
  slug: string;
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}) => {
  const id = useId();
  const update = (key: string, value: WidgetConfig[keyof WidgetConfig]) =>
    onChange({ ...config, [key]: value });
  const numberField = (
    key: "count" | "min_headings",
    label: string,
    fallback: number,
    max: number,
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} style={labelStyle}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="number"
        min={1}
        max={max}
        style={{ ...inputStyle, width: 80 }}
        value={config[key] ?? fallback}
        onChange={(e) => update(key, parseInt(e.target.value) || fallback)}
      />
    </div>
  );

  switch (slug) {
    case "sidebar-newsletter":
      return (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor={`${id}-title`} style={labelStyle}>
              Title
            </label>
            <input
              id={`${id}-title`}
              style={inputStyle}
              value={config.title || ""}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-description`} style={labelStyle}>
              Description
            </label>
            <input
              id={`${id}-description`}
              style={inputStyle}
              value={config.description || ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
        </div>
      );

    case "sidebar-recent-posts":
    case "sidebar-popular-posts":
      return numberField("count", "Number of posts", 5, 20);

    case "sidebar-custom-html":
      return (
        <div>
          <label htmlFor={`${id}-html`} style={labelStyle}>
            HTML Content
          </label>
          <textarea
            id={`${id}-html`}
            rows={6}
            style={{
              ...inputStyle,
              fontFamily: "monospace",
              backgroundColor: "hsl(var(--admin-surface-2))",
            }}
            value={config.html || ""}
            onChange={(e) => update("html", e.target.value)}
          />
        </div>
      );

    case "page-author-bio":
      return (
        <div>
          <label
            className="flex items-center gap-2 cursor-pointer font-body"
            style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}
          >
            <input
              type="checkbox"
              checked={config.show_image !== false}
              onChange={(e) => update("show_image", e.target.checked)}
            />
            Show author initial
          </label>
          <p className="font-body mt-2" style={helpStyle}>
            Author data is pulled from Brand &amp; publishing.
          </p>
        </div>
      );

    case "page-related-posts":
      return numberField("count", "Number of related posts", 3, 12);

    case "page-share-bar":
      return (
        <fieldset>
          <legend style={labelStyle}>Platforms</legend>
          <div className="flex flex-wrap gap-3 mt-1">
            {SHARE_PLATFORMS.map((p) => {
              const platforms: string[] = config.platforms || [];
              const checked = platforms.includes(p);
              return (
                <label
                  key={p}
                  className="flex items-center gap-1 font-body capitalize cursor-pointer"
                  style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      update(
                        "platforms",
                        checked
                          ? platforms.filter((x) => x !== p)
                          : [...platforms, p],
                      )
                    }
                  />
                  {p === "copy" ? "Copy Link" : p}
                </label>
              );
            })}
          </div>
        </fieldset>
      );

    case "page-toc":
      return numberField("min_headings", "Minimum headings to show TOC", 3, 20);

    case "page-reading-progress":
      return (
        <div>
          <label htmlFor={`${id}-color`} style={labelStyle}>
            Bar color
          </label>
          {/* "custom" was an alias for accent; it is shown as Accent. */}
          <select
            id={`${id}-color`}
            style={inputStyle}
            value={
              !config.color || config.color === "custom"
                ? "accent"
                : config.color
            }
            onChange={(e) => update("color", e.target.value)}
          >
            <option value="accent">Accent</option>
            <option value="sage">Sage</option>
            <option value="blue">Blue</option>
          </select>
        </div>
      );

    case "footer-columns":
      return <FooterColumnsFields config={config} onChange={onChange} />;

    case "sidebar-categories":
    case "sidebar-social-links":
    case "page-back-to-top":
      return (
        <p className="font-body" style={helpStyle}>
          No configuration needed — just toggle on/off.
        </p>
      );

    default:
      return null;
  }
};

const FooterColumnsFields = ({
  config,
  onChange,
}: {
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}) => {
  const id = useId();
  const columns = config.columns || 3;
  const setColumn = (i: number, key: "title" | "text", value: string) => {
    const content = [...(config.content || [])];
    content[i] = { ...content[i], [key]: value };
    onChange({ ...config, content });
  };
  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend style={labelStyle}>Number of columns</legend>
        <div className="flex gap-3 mt-1">
          {[2, 3, 4].map((n) => (
            <label
              key={n}
              className="flex items-center gap-1 font-body cursor-pointer"
              style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
            >
              <input
                type="radio"
                name={`${id}-footer-cols`}
                checked={(config.columns ?? 3) === n}
                onChange={() => {
                  const content = config.content || [];
                  onChange({
                    ...config,
                    columns: n,
                    content: Array.from(
                      { length: n },
                      (_, i) => content[i] || {},
                    ),
                  });
                }}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      {Array.from({ length: columns }).map((_, i) => {
        const col = (config.content || [])[i] || {};
        return (
          <div
            key={i}
            className="p-3"
            style={{
              border: "1px solid hsl(var(--admin-border))",
              borderRadius: 4,
            }}
          >
            <label htmlFor={`${id}-${i}-title`} style={labelStyle}>
              Column {i + 1} Title
            </label>
            <input
              id={`${id}-${i}-title`}
              style={inputStyle}
              value={col.title || ""}
              onChange={(e) => setColumn(i, "title", e.target.value)}
            />
            <label
              htmlFor={`${id}-${i}-text`}
              style={{ ...labelStyle, marginTop: 8 }}
            >
              Content
            </label>
            <textarea
              id={`${id}-${i}-text`}
              rows={3}
              style={inputStyle}
              value={col.text || ""}
              onChange={(e) => setColumn(i, "text", e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
};

export default WidgetConfigFields;
