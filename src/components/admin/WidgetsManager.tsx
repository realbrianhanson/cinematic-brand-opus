import { parseWidgetConfig, type WidgetConfig } from "@/lib/widgetConfig";
import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { withTimeout } from "@/lib/withTimeout";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  confirmDiscardAdminDraft,
  useConfigurationDraftGuard,
} from "./useConfigurationDraftGuard";
import WidgetConfigFields from "./WidgetConfigFields";

type Widget = {
  id: string;
  widget_slug: string;
  widget_zone: string;
  display_name: string;
  is_enabled: boolean;
  config: WidgetConfig;
  sort_order: number;
  updated_at: string | null;
};
type WidgetPatch = Partial<
  Pick<Widget, "config" | "is_enabled" | "sort_order">
>;
type SaveResult = {
  error: Error | { message: string } | null;
  version?: string | null;
};
type SaveStatus = "idle" | "saving" | "saved" | "error";

const QUERY_KEY = ["admin-widgets"];
/** Pause after the last keystroke before a config edit is saved. */
export const WIDGET_SAVE_DELAY_MS = 600;
/** A stalled transport must not block the next queued edit indefinitely. */
export const WIDGET_REQUEST_TIMEOUT_MS = 15_000;

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

async function saveWidget(
  id: string,
  patch: WidgetPatch,
  expectedVersion: string | null,
): Promise<SaveResult> {
  const controller = new AbortController();
  try {
    let query = supabase.from("widget_config").update(patch).eq("id", id);
    query =
      expectedVersion === null
        ? query.is("updated_at", null)
        : query.eq("updated_at", expectedVersion);
    const { data, error } = await withTimeout(
      Promise.resolve(
        query.select("id,updated_at").abortSignal(controller.signal),
      ),
      WIDGET_REQUEST_TIMEOUT_MS,
    );
    if (error) return { error };
    if (data?.length !== 1)
      return {
        error: new Error(
          "This widget changed or was removed in another session. Your draft is still here. Reload the saved widget before editing again.",
        ),
      };
    return { error: null, version: data[0].updated_at };
  } catch (error) {
    return {
      error: new Error(
        `${errorMessage(error)} Your draft is still here. Reload the saved widget if the save could not be confirmed.`,
      ),
    };
  } finally {
    controller.abort();
  }
}

const WidgetsManager = () => {
  const [activeTab, setActiveTab] = useState<ZoneId>("page");
  const [reordering, setReordering] = useState(false);
  const reorderingRef = useRef(false);
  const saves = useRef(new Map<string, Promise<SaveResult>>());
  const togglingRef = useRef(new Set<string>());
  const [toggling, setToggling] = useState(new Set<string>());
  const queryClient = useQueryClient();
  const [dirtyWidgets, setDirtyWidgets] = useState(new Set<string>());
  const [savingCount, setSavingCount] = useState(0);
  const dirtyIds = useRef(dirtyWidgets);
  dirtyIds.current = dirtyWidgets;
  useConfigurationDraftGuard(
    dirtyWidgets.size > 0,
    savingCount > 0 || reordering || toggling.size > 0,
  );
  const markDirty = (id: string, dirty: boolean) =>
    setDirtyWidgets((old) => {
      if (old.has(id) === dirty) return old;
      const next = new Set(old);
      if (dirty) next.add(id);
      else next.delete(id);
      dirtyIds.current = next;
      return next;
    });
  const tabsId = useId();

  const {
    data: widgets,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: QUERY_KEY,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const controller = new AbortController();
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(
            supabase
              .from("widget_config")
              .select("*")
              .order("sort_order", { ascending: true })
              .abortSignal(controller.signal),
          ),
          WIDGET_REQUEST_TIMEOUT_MS,
        );
        if (error) throw error;
        const loaded = (data ?? []).map((w) => ({
          ...w,
          config: parseWidgetConfig(w.config),
        })) as Widget[];
        const cached = queryClient.getQueryData<Widget[]>(QUERY_KEY) ?? [];
        return [
          ...loaded,
          ...cached.filter(
            (w) =>
              dirtyIds.current.has(w.id) &&
              !loaded.some((row) => row.id === w.id),
          ),
        ];
      } finally {
        controller.abort();
      }
    },
  });

  // Update only the saved row; a full refetch would overwrite newer drafts.
  const patchCache = (
    id: string,
    patch: WidgetPatch & { updated_at?: string | null },
  ) =>
    queryClient.setQueryData<Widget[]>(QUERY_KEY, (old) =>
      old?.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );

  const persist = (
    widget: Widget,
    patch: WidgetPatch,
    expectedVersion = widget.updated_at,
  ) => {
    setSavingCount((count) => count + 1);
    // Keep writes ordered even when changing zones unmounts the editor card.
    const pending = (
      saves.current.get(widget.id) ??
      Promise.resolve({ error: null } as SaveResult)
    ).then(async () => {
      const result = await saveWidget(widget.id, patch, expectedVersion);
      if (result.error) {
        toast({
          title: `Couldn't save ${widget.display_name}`,
          description: errorMessage(result.error),
          variant: "destructive",
        });
        return result;
      }
      patchCache(widget.id, { ...patch, updated_at: result.version });
      return result;
    });
    saves.current.set(widget.id, pending);
    void pending.then(() => {
      setSavingCount((count) => count - 1);
      if (saves.current.get(widget.id) === pending)
        saves.current.delete(widget.id);
    });
    return pending;
  };

  const handleToggle = async (widget: Widget) => {
    if (togglingRef.current.has(widget.id)) return;
    togglingRef.current.add(widget.id);
    setToggling(new Set(togglingRef.current));
    const is_enabled = !widget.is_enabled;
    patchCache(widget.id, { is_enabled });
    try {
      if ((await persist(widget, { is_enabled })).error)
        patchCache(widget.id, { is_enabled: widget.is_enabled });
    } finally {
      togglingRef.current.delete(widget.id);
      setToggling(new Set(togglingRef.current));
    }
  };

  const handleReorder = async (widget: Widget, direction: "up" | "down") => {
    if (reorderingRef.current || dirtyIds.current.size || saves.current.size)
      return;
    const inZone = (widgets || [])
      .filter((w) => w.widget_zone === widget.widget_zone)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    const idx = inZone.findIndex((w) => w.id === widget.id);
    const other = inZone[direction === "up" ? idx - 1 : idx + 1];
    if (!other) return;
    reorderingRef.current = true;
    setReordering(true);
    const controller = new AbortController();
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase
            .rpc("admin_swap_widget_order", {
              _first_id: widget.id,
              _second_id: other.id,
              _first_order: widget.sort_order,
              _second_order: other.sort_order,
              _direction: direction,
            })
            .abortSignal(controller.signal),
        ),
        WIDGET_REQUEST_TIMEOUT_MS,
      );
      if (error) throw error;
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        data.saved !== true
      )
        throw new Error(
          "The reorder was not confirmed. Reload before trying again.",
        );
    } catch (error) {
      toast({
        title: "Couldn't reorder widgets",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      controller.abort();
      // Show the order the database actually holds.
      try {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } finally {
        reorderingRef.current = false;
        setReordering(false);
      }
    }
  };

  const zone = ZONES.find((z) => z.id === activeTab) ?? ZONES[0];
  const widgetGroups = ZONES.map(({ id }) => ({
    id,
    widgets: (widgets || [])
      .filter((w) => w.widget_zone === id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
  }));

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
          {widgetGroups.map((group) => (
            <div
              key={group.id}
              className="flex flex-col gap-4"
              style={{ display: group.id === activeTab ? undefined : "none" }}
            >
              {group.widgets.map((widget, idx) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  isFirst={idx === 0}
                  isLast={idx === group.widgets.length - 1}
                  reordering={reordering}
                  orderLocked={
                    reordering || savingCount > 0 || dirtyWidgets.size > 0
                  }
                  toggling={toggling.has(widget.id)}
                  onToggle={() => handleToggle(widget)}
                  onSaveConfig={(config, version) =>
                    persist(widget, { config }, version)
                  }
                  onDirtyChange={(dirty) => markDirty(widget.id, dirty)}
                  onReload={async () => {
                    const { data, error } = await withTimeout(
                      Promise.resolve(
                        supabase
                          .from("widget_config")
                          .select("*")
                          .eq("id", widget.id)
                          .maybeSingle(),
                      ),
                      WIDGET_REQUEST_TIMEOUT_MS,
                    );
                    if (error) throw error;
                    if (!data)
                      throw new Error(
                        "This widget no longer exists. Your draft is still here.",
                      );
                    const row = {
                      ...data,
                      config: parseWidgetConfig(data.config),
                    } as Widget;
                    queryClient.setQueryData<Widget[]>(QUERY_KEY, (old) =>
                      old?.map((item) => (item.id === row.id ? row : item)),
                    );
                    return row;
                  }}
                  onReorder={(dir) => handleReorder(widget, dir)}
                />
              ))}
            </div>
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
  onSave: (config: WidgetConfig, version: string | null) => Promise<SaveResult>,
  onReload: () => Promise<Widget>,
  onDirtyChange: (dirty: boolean) => void,
) {
  const [draft, setDraft] = useState<WidgetConfig>(widget.config);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [reloading, setReloading] = useState(false);
  const edits = useRef({ made: 0, saved: 0 });
  const baselineVersion = useRef(widget.updated_at);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ draft, onSave, onDirtyChange });
  latest.current = { draft, onSave, onDirtyChange };

  const serverConfig = JSON.stringify(widget.config);
  useEffect(() => {
    if (edits.current.made === edits.current.saved && !inFlight.current) {
      setDraft(JSON.parse(serverConfig) as WidgetConfig);
      baselineVersion.current = widget.updated_at;
    }
  }, [serverConfig, widget.updated_at]);

  const flush = async () => {
    timer.current = null;
    if (inFlight.current) return;
    const version = edits.current.made;
    inFlight.current = true;
    setStatus("saving");
    const result = await latest.current.onSave(
      latest.current.draft,
      baselineVersion.current,
    );
    inFlight.current = false;
    if (!result.error) {
      edits.current.saved = version;
      baselineVersion.current = result.version ?? null;
    }
    const dirty = edits.current.made !== edits.current.saved;
    latest.current.onDirtyChange(dirty);
    if (result.error) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setStatus("error");
    } else if (dirty) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), WIDGET_SAVE_DELAY_MS);
    } else setStatus("saved");
  };

  // Navigation is guarded at the manager; do not launch untracked writes from
  // an unmounted editor after the user deliberately discarded its draft.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const change = (next: WidgetConfig) => {
    edits.current.made += 1;
    latest.current.draft = next;
    setDraft(next);
    latest.current.onDirtyChange(true);
    if (timer.current) clearTimeout(timer.current);
    // A conflict must be resolved deliberately, never by another keystroke.
    if (status !== "error") {
      setStatus("idle");
      timer.current = setTimeout(() => void flush(), WIDGET_SAVE_DELAY_MS);
    }
  };
  const reload = async () => {
    if (inFlight.current || !confirmDiscardAdminDraft()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    inFlight.current = true;
    setReloading(true);
    setStatus("saving");
    try {
      const row = await onReload();
      baselineVersion.current = row.updated_at;
      edits.current.saved = edits.current.made;
      latest.current.draft = row.config;
      setDraft(row.config);
      latest.current.onDirtyChange(false);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      toast({
        title: "Couldn't reload widget",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      inFlight.current = false;
      setReloading(false);
    }
  };
  return {
    draft,
    status,
    change,
    retry: flush,
    reload,
    reloading,
    dirty: edits.current.made !== edits.current.saved,
  };
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
  orderLocked,
  toggling,
  onToggle,
  onSaveConfig,
  onReload,
  onDirtyChange,
  onReorder,
}: {
  widget: Widget;
  isFirst: boolean;
  isLast: boolean;
  reordering: boolean;
  orderLocked: boolean;
  toggling: boolean;
  onToggle: () => void;
  onSaveConfig: (
    config: WidgetConfig,
    version: string | null,
  ) => Promise<SaveResult>;
  onReload: () => Promise<Widget>;
  onDirtyChange: (dirty: boolean) => void;
  onReorder: (dir: "up" | "down") => void;
}) => {
  const { draft, status, change, retry, reload, reloading, dirty } =
    useWidgetDraft(widget, onSaveConfig, onReload, onDirtyChange);
  const arrow = (dir: "up" | "down", disabled: boolean) => (
    <button
      type="button"
      onClick={() => onReorder(dir)}
      disabled={disabled || orderLocked}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            className="font-body"
            style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
          >
            {STATUS_TEXT[status]}
          </span>
          {status === "error" && (
            <>
              <button
                type="button"
                className="admin-btn-ghost"
                aria-label={`Retry saving ${widget.display_name}`}
                onClick={() => void retry()}
              >
                Retry
              </button>
            </>
          )}
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={status === "saving" || toggling || reordering}
            onClick={() => void reload()}
            aria-label={`Reload saved ${widget.display_name}`}
          >
            Reload saved
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              aria-label={`Show ${widget.display_name}`}
              checked={widget.is_enabled}
              disabled={
                toggling ||
                reloading ||
                dirty ||
                status === "saving" ||
                reordering
              }
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
          <fieldset disabled={reloading || toggling || reordering}>
            <WidgetConfigFields
              slug={widget.widget_slug}
              config={draft}
              onChange={change}
            />
          </fieldset>
        </div>
      )}
    </div>
  );
};

export default WidgetsManager;
