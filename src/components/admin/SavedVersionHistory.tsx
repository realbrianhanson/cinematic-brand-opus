import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  asEditorialRecord,
  editorialComparisonText,
  editorialSources,
  readEditorialRevision,
  type EditorialKind,
} from "@/lib/editorialHistory";

export default function SavedVersionHistory({
  kind,
  documentId,
  current,
  disabled = false,
  onLoad,
}: {
  kind: EditorialKind;
  documentId?: string;
  current: Record<string, unknown>;
  disabled?: boolean;
  onLoad: (
    value: NonNullable<ReturnType<typeof readEditorialRevision>>,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const history = useQuery({
    queryKey: ["editorial-saved-versions", kind, documentId],
    enabled: open && !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(
          kind === "guide"
            ? "pillar_page_revisions"
            : "generated_page_revisions",
        )
        .select("id,page_id,snapshot,actor_id,change_source,created_at")
        .eq("page_id", documentId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20)
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!documentId) return null;
  const selected = history.data?.find((row) => row.id === selectedId);
  const editable = selected
    ? readEditorialRevision(kind, documentId, selected.snapshot)
    : null;
  const sources = selected ? editorialSources(selected.snapshot) : [];
  return (
    <section
      className="admin-card mb-5 p-4 space-y-3"
      aria-label="Saved version history"
    >
      <button
        type="button"
        className="admin-btn-ghost"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Saved versions
      </button>
      {open && (
        <>
          <p className="admin-help">
            Previous saved versions are captured when content, SEO or status
            changes. These records are not fact-checks or review approvals. Up
            to 20 versions are kept.
          </p>
          {history.isPending ? (
            <p role="status">Loading saved versions…</p>
          ) : history.isError ? (
            <div role="alert">
              Saved versions could not be loaded.{" "}
              <button type="button" onClick={() => void history.refetch()}>
                Retry history
              </button>
            </div>
          ) : !history.data?.length ? (
            <p>
              No previous saved versions yet. History begins after this feature
              is enabled.
            </p>
          ) : (
            <label className="block text-sm">
              Choose a saved version
              <select
                className="admin-input mt-2 w-full"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setMessage("");
                }}
              >
                <option value="">Choose a version</option>
                {history.data.map((row) => (
                  <option key={row.id} value={row.id}>
                    {new Date(row.created_at).toLocaleString()} ·{" "}
                    {String(
                      asEditorialRecord(row.snapshot).title || "Untitled",
                    )}{" "}
                    ·{" "}
                    {row.change_source === "authenticated"
                      ? "Signed-in change"
                      : "System change"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected && (
            <>
              <p className="admin-help">
                Captured before the change at{" "}
                {new Date(selected.created_at).toLocaleString()}. Historical
                status:{" "}
                {String(
                  asEditorialRecord(selected.snapshot).status ?? "Unknown",
                )}
                .
              </p>
              {sources.length > 0 && (
                <div>
                  <p className="text-sm font-semibold">
                    Saved source references
                  </p>
                  <ul className="list-disc pl-5">
                    {sources.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    Current working draft
                  </h3>
                  <pre className="text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto border p-3">
                    {editorialComparisonText(current)}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    Selected saved version
                  </h3>
                  <pre className="text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto border p-3">
                    {editorialComparisonText(selected.snapshot)}
                  </pre>
                </div>
              </div>
              <p className="admin-help">
                Load title, content and full SEO metadata into the editor for
                review. The current URL, status, scores and publication settings
                stay in place. Nothing is saved or published until you choose
                Save.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={disabled || !editable}
                  onClick={() => {
                    if (
                      !editable ||
                      !window.confirm(
                        "Load this saved version into your working draft? Current unsaved title, content and SEO edits will be replaced. This does not save or publish.",
                      )
                    )
                      return;
                    onLoad(editable);
                    setMessage(
                      "Version loaded into the working draft. Review it, then save when ready.",
                    );
                  }}
                >
                  Load version into editor
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(selected.snapshot, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${kind}-saved-version.json`;
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Download version JSON
                </button>
              </div>
              {!editable && (
                <p role="alert">
                  This version is not compatible with this editor. Download it
                  to recover the content manually.
                </p>
              )}
            </>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
