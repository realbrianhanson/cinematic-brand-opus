import { parseWidgetConfig, type WidgetConfig } from "@/lib/widgetConfig";
import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown } from "lucide-react";
import WidgetConfigFields from "./WidgetConfigFields";

type Widget = {
  id: string;
  widget_slug: string;
  widget_zone: string;
  display_name: string;
  is_enabled: boolean;
  config: WidgetConfig;
  sort_order: number;
};
type WidgetPatch = Partial<
  Pick<Widget, "config" | "is_enabled" | "sort_order">
>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const QUERY_KEY = ["admin-widgets"];
/** Pause after the last keystroke before a config edit is saved. */
export const WIDGET_SAVE_DELAY_MS = 600;

// Page first: it is the zone visitors see on every article. The sidebar zone
// has no public layout, so it is listed last and explained.
const ZONES = [
  {
    id: "page",
    label: "Page",
    help: "Shown on articles and resources, below the content.",
  },
  { id: "footer", label: "Footer", help: "Shown in the site-wide footer." },
  {
    id: "sidebar",
    label: "Sidebar (not shown)",
    help: "",
  },
] as const;
type ZoneId = (typeof ZONES)[number]["id"];

async function saveWidget(id: string, patch: WidgetPatch) {
  const { data, error } = await supabase
    .from("widget_config")
    .update(patch)
    .eq("id", id)
    .select("id");
  // A row blocked by RLS returns no error and no rows: treat it as a failure.
  if (error) return error;
  if (!data?.length) return new Error("The change was not saved.");
  return null;
}

const WidgetsManager = () => {
  const [activeTab, setActiveTab] = useState<ZoneId>("page");
  const [reordering, setReordering] = useState(false);
  const queryClient = useQueryClient();
  const tabsId = useId();

  const {
    data: widgets,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widget_config")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((w) => ({
        ...w,
        config: parseWidgetConfig(w.config),
      })) as Widget[];
    },
  });

  // Update only the saved row; a full refetch would overwrite newer drafts.
  const patchCache = (id: string, patch: WidgetPatch) =>
    queryClient.setQueryData<Widget[]>(QUERY_KEY, (old) =>
      old?.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );

  const persist = async (widget: Widget, patch: WidgetPatch) => {
    const error = await saveWidget(widget.id, patch);
    if (error) {
      toast({
        title: `Couldn't save ${widget.display_name}`,
        description: errorMessage(error),
        variant: "destructive",
      });
      return false;
    }
    patchCache(widget.id, patch);
    return true;
  };

  const handleToggle = async (widget: Widget) => {
    const is_enabled = !widget.is_enabled;
    patchCache(widget.id, { is_enabled });
    if (!(await persist(widget, { is_enabled })))
      patchCache(widget.id, { is_enabled: widget.is_enabled });
  };

  const handleReorder = async (widget: Widget, direction: "up" | "down") => {
    const inZone = (widgets || [])
      .filter((w) => w.widget_zone === widget.widget_zone)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = inZone.findIndex((w) => w.id === widget.id);
    const other = inZone[direction === "up" ? idx - 1 : idx + 1];
    if (!other) return;
    // Equal sort_order values cannot be swapped; step past the neighbour.
    const step = direction === "up" ? -1 : 1;
    const [mine, theirs] =
      widget.sort_order === other.sort_order
        ? [other.sort_order + step, other.sort_order]
        : [other.sort_order, widget.sort_order];
    setReordering(true);
    try {
      const results = await Promise.all([
        saveWidget(widget.id, { sort_order: mine }),
        saveWidget(other.id, { sort_order: theirs }),
      ]);
      const error = results.find(Boolean);
      if (error)
        toast({
          title: "Couldn't reorder widgets",
          description: errorMessage(error),
          variant: "destructive",
        });
    } finally {
      setReordering(false);
      // Show the order the database actually holds.
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }
  };

  const zone = ZONES.find((z) => z.id === activeTab) ?? ZONES[0];
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

      <div
        role="tablist"
        aria-label="Widget zones"
        className="flex flex-wrap gap-1 mb-6"
        style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}
      >
        {ZONES.map(({ id, label }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${tabsId}-${id}`}
              aria-selected={selected}
              aria-controls={`${tabsId}-panel`}
              onClick={() => setActiveTab(id)}
              className="font-body"
              style={{
                fontSize: 13,
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${selected ? "hsl(var(--admin-accent))" : "transparent"}`,
                color: selected
                  ? "hsl(var(--admin-accent))"
                  : "hsl(var(--admin-text-soft))",
                cursor: "pointer",
                fontWeight: selected ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-${activeTab}`}
      >
        {zone.id === "sidebar" ? (
          <div
            role="note"
            className="admin-notice font-body mb-6"
            style={{ color: "hsl(var(--admin-text-soft))" }}
          >
            These widgets are not shown on the site. Articles and resources use
            a single-column layout with no sidebar, so settings saved here,
            including Newsletter Signup, never reach visitors. Use the Page tab
            for widgets that appear on articles.
          </div>
        ) : (
          <p
            className="font-body mb-6"
            style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}
          >
            {zone.help}
          </p>
        )}

        {isLoading && (
          <p
            className="font-body"
            style={{ color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}
          >
            Loading widgets...
          </p>
        )}
        {loadError && (
          <p
            role="alert"
            className="font-body"
            style={{ color: "hsl(var(--admin-danger))", fontSize: 13 }}
          >
            Couldn't load widgets: {errorMessage(loadError)}. Refresh the page
            to try again.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {zoneWidgets.map((widget, idx) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              isFirst={idx === 0}
              isLast={idx === zoneWidgets.length - 1}
              reordering={reordering}
              onToggle={() => handleToggle(widget)}
              onSaveConfig={(config) => persist(widget, { config })}
              onReorder={(dir) => handleReorder(widget, dir)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Local draft of a widget's config. Inputs are driven by the draft, never by
 * the query cache, so a refetch cannot overwrite text being typed.
 */
function useWidgetDraft(
  widget: Widget,
  onSave: (config: WidgetConfig) => Promise<boolean>,
) {
  const [draft, setDraft] = useState<WidgetConfig>(widget.config);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const edits = useRef({ made: 0, saved: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ draft, onSave });
  latest.current = { draft, onSave };

  const serverConfig = JSON.stringify(widget.config);
  useEffect(() => {
    const clean = edits.current.made === edits.current.saved;
    if (clean) setDraft(JSON.parse(serverConfig) as WidgetConfig);
  }, [serverConfig]);

  const flush = async () => {
    timer.current = null;
    const version = edits.current.made;
    setStatus("saving");
    const ok = await latest.current.onSave(latest.current.draft);
    if (ok) edits.current.saved = Math.max(edits.current.saved, version);
    const pending = edits.current.made !== version || timer.current;
    if (!pending) setStatus(ok ? "saved" : "error");
  };

  // Save anything still pending when the card unmounts (e.g. tab switch);
  // flush reads refs only, so the empty dependency list is intentional.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      void flush();
    },
    [],
  );

  const change = (next: WidgetConfig) => {
    edits.current.made += 1;
    latest.current.draft = next;
    setDraft(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), WIDGET_SAVE_DELAY_MS);
  };

  return { draft, status, change };
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

const WidgetCard = ({
  widget,
  isFirst,
  isLast,
  reordering,
  onToggle,
  onSaveConfig,
  onReorder,
}: {
  widget: Widget;
  isFirst: boolean;
  isLast: boolean;
  reordering: boolean;
  onToggle: () => void;
  onSaveConfig: (config: WidgetConfig) => Promise<boolean>;
  onReorder: (dir: "up" | "down") => void;
}) => {
  const { draft, status, change } = useWidgetDraft(widget, onSaveConfig);
  const arrow = (dir: "up" | "down", disabled: boolean) => (
    <button
      type="button"
      onClick={() => onReorder(dir)}
      disabled={disabled || reordering}
      aria-label={`Move ${widget.display_name} ${dir}`}
      title={dir === "up" ? "Move up" : "Move down"}
      style={{
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        color: disabled
          ? "hsl(var(--admin-text-ghost))"
          : "hsl(var(--admin-text-soft))",
        minWidth: 32,
        minHeight: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {dir === "up" ? (
        <ChevronUp size={14} aria-hidden="true" />
      ) : (
        <ChevronDown size={14} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "hsl(var(--admin-surface-2))",
        border: "1px solid hsl(var(--admin-border))",
        borderRadius: 6,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex flex-col">
            {arrow("up", isFirst)}
            {arrow("down", isLast)}
          </div>
          <div className="min-w-0">
            <p
              className="font-body"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "hsl(var(--admin-text))",
              }}
            >
              {widget.display_name}
            </p>
            <p
              className="font-body"
              style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}
            >
              {widget.widget_slug}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            role="status"
            className="font-body"
            style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
          >
            {STATUS_TEXT[status]}
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              aria-label={`Show ${widget.display_name}`}
              checked={widget.is_enabled}
              onChange={onToggle}
              className="sr-only peer"
            />
            <div
              className="relative w-9 h-5 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
              style={{
                backgroundColor: widget.is_enabled
                  ? "hsl(var(--admin-accent))"
                  : "hsl(var(--admin-border))",
              }}
            >
              <div
                className="absolute top-[2px] rounded-full h-4 w-4 transition-transform"
                style={{
                  background: "#fff",
                  transform: widget.is_enabled
                    ? "translateX(18px)"
                    : "translateX(2px)",
                }}
              />
            </div>
          </label>
        </div>
      </div>

      {widget.is_enabled && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid hsl(var(--admin-border))" }}
        >
          <WidgetConfigFields
            slug={widget.widget_slug}
            config={draft}
            onChange={change}
          />
        </div>
      )}
    </div>
  );
};

export default WidgetsManager;
