import { useEffect, useRef, useState } from "react";
import { validOfferUrl, type OfferProof } from "@/lib/offerBuilder";
import {
  deleteOfferProof,
  listOfferProof,
  saveOfferProof,
} from "@/lib/offerBuilderClient";

export type OfferProofLibraryProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onInsert: (proof: OfferProof) => void;
};
type ProofInput = Omit<OfferProof, "id" | "created_at" | "updated_at"> & {
  id?: string;
};
const blank: ProofInput = {
  title: "",
  kind: "testimonial",
  content: "",
  attribution: "",
  source_url: "",
  notes: "",
  approved: false,
};

export default function OfferProofLibrary({
  selectedIds,
  onChange,
  onInsert,
}: OfferProofLibraryProps) {
  const [items, setItems] = useState<OfferProof[]>([]);
  const [editing, setEditing] = useState<ProofInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const editorKey = editing ? editing.id || "new" : "";
  // Open the editor where the admin is looking and put focus in it.
  useEffect(() => {
    if (!editorKey) return;
    titleRef.current?.scrollIntoView?.({ block: "center" });
    titleRef.current?.focus();
  }, [editorKey]);
  useEffect(() => {
    let active = true;
    void listOfferProof()
      .then((proof) => {
        if (active) setItems(proof);
      })
      .catch(() => {
        if (active)
          setError(
            "The proof library could not be loaded. Your page is unchanged.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function update<K extends keyof ProofInput>(key: K, value: ProofInput[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current));
  }
  async function save() {
    if (!editing || busy) return;
    if (!editing.title.trim() || !editing.content.trim()) {
      setError(
        "Add a title and the exact quote, demonstration description, or fact.",
      );
      return;
    }
    if (editing.source_url && !validOfferUrl(editing.source_url)) {
      setError(
        "Source URL: use a complete HTTPS address with a valid domain and no spaces, username or password.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveOfferProof({
        ...editing,
        title: editing.title.trim(),
        content: editing.content.trim(),
      });
      setItems((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      if (!saved.approved && selectedIds.includes(saved.id))
        onChange(selectedIds.filter((id) => id !== saved.id));
      setEditing(null);
      setNotice(
        "Evidence saved. Existing page snapshots keep their current wording until you replace them.",
      );
    } catch {
      setError("The evidence could not be saved. Your changes are still here.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: OfferProof) {
    if (
      busy ||
      !window.confirm(
        `Remove “${item.title}” from the proof library? Existing page snapshots will keep their current wording.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteOfferProof(item.id);
      setItems((current) => current.filter((proof) => proof.id !== item.id));
      onChange(selectedIds.filter((id) => id !== item.id));
      if (editing?.id === item.id) setEditing(null);
      setNotice(
        "Evidence removed from the library. Existing page snapshots are unchanged.",
      );
    } catch {
      setError("The evidence could not be removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const editor = editing ? (
    <div
      className="space-y-4 rounded border border-current/20 p-4"
      role="group"
      aria-label="Evidence editor"
      onKeyDown={(event) => {
        // Enter in a single-line field saves this evidence, never the offer.
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.type !== "checkbox"
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <h4 className="font-semibold">
        {editing.id ? "Edit evidence" : "New evidence"}
      </h4>
      <label className="block text-sm">
        Evidence title
        <input
          ref={titleRef}
          className="admin-input mt-2 w-full"
          maxLength={200}
          value={editing.title}
          onChange={(event) => update("title", event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block text-sm">
        Evidence type
        <select
          className="admin-input mt-2 w-full"
          value={editing.kind}
          onChange={(event) =>
            update("kind", event.target.value as OfferProof["kind"])
          }
          disabled={busy}
        >
          <option value="testimonial">Testimonial</option>
          <option value="demonstration">Demonstration</option>
          <option value="fact">Documented fact</option>
        </select>
      </label>
      <label className="block text-sm">
        Exact quote or documented description
        <textarea
          className="admin-input mt-2 w-full"
          rows={5}
          maxLength={6000}
          value={editing.content}
          onChange={(event) => update("content", event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block text-sm">
        Public attribution
        <input
          className="admin-input mt-2 w-full"
          maxLength={500}
          value={editing.attribution}
          onChange={(event) => update("attribution", event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block text-sm">
        Source URL <span className="opacity-60">(private reference)</span>
        <input
          type="url"
          className="admin-input mt-2 w-full"
          maxLength={2048}
          value={editing.source_url}
          onChange={(event) => update("source_url", event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="block text-sm">
        Context and permissions{" "}
        <span className="opacity-60">(private notes)</span>
        <textarea
          className="admin-input mt-2 w-full"
          rows={3}
          maxLength={3000}
          value={editing.notes}
          onChange={(event) => update("notes", event.target.value)}
          disabled={busy}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={editing.approved}
          onChange={(event) => update("approved", event.target.checked)}
          disabled={busy}
        />
        I have checked this evidence and approved its wording and attribution
        for use.
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="admin-btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save evidence"}
        </button>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={busy}
          onClick={() => setEditing(null)}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;
  return (
    <section className="admin-card space-y-4 p-5" aria-label="Proof library">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Proof library</h3>
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={busy}
          onClick={() => {
            setEditing({ ...blank });
            setError("");
            setNotice("");
          }}
        >
          Add evidence
        </button>
      </div>
      <p className="text-sm opacity-75">
        Save real testimonials, demonstrations and documented facts. Select
        approved evidence for the copy assistant, or insert an approved item
        into the page.
      </p>
      {loading && (
        <p role="status" className="text-sm">
          Loading evidence…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {editing && !editing.id && editor}
      {!loading && !items.length && (
        <p className="text-sm opacity-70">
          No saved evidence yet. A product demonstration can be useful proof
          even before you have testimonials.
        </p>
      )}
      {items.map((item) =>
        editing?.id === item.id ? (
          <div key={item.id}>{editor}</div>
        ) : (
          <article
            key={item.id}
            className="space-y-3 rounded border border-current/15 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-semibold">{item.title}</h4>
              <span className="text-xs">
                {item.approved ? "Approved" : "Needs review"}
              </span>
            </div>
            <p className="whitespace-pre-line text-sm">{item.content}</p>
            {item.attribution && (
              <p className="text-xs opacity-75">{item.attribution}</p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                disabled={
                  busy ||
                  !item.approved ||
                  (!selectedIds.includes(item.id) && selectedIds.length >= 30)
                }
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selectedIds, item.id]
                      : selectedIds.filter((id) => id !== item.id),
                  )
                }
              />
              Use as evidence for this offer
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-btn-secondary"
                disabled={busy || !item.approved}
                onClick={() => {
                  onInsert({ ...item, source_url: "", notes: "" });
                  setNotice(
                    "Approved evidence inserted into the working page. Source notes stay in the private library.",
                  );
                }}
              >
                Insert into page
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={busy}
                onClick={() => {
                  const {
                    created_at: _created,
                    updated_at: _updated,
                    ...input
                  } = item;
                  setEditing(input);
                  setError("");
                }}
              >
                Edit evidence
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={busy}
                onClick={() => void remove(item)}
              >
                Remove
              </button>
            </div>
          </article>
        ),
      )}
    </section>
  );
}
