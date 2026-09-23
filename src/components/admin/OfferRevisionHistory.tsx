import { useState } from "react";
import { History } from "lucide-react";
import type { OfferChange } from "@/lib/offerBuilderDiff";
import type {
  OfferBuilderDocument,
  OfferBuilderRevision,
} from "@/lib/offerBuilderClient";
import OfferConfirmDialog from "./OfferConfirmDialog";

/** Saved revisions; restoring shows its price, URL, file and follow-up first. */
export default function OfferRevisionHistory({
  history,
  dirty,
  compare,
  onRestore,
}: {
  history: OfferBuilderRevision[];
  dirty: boolean;
  compare: (document: OfferBuilderDocument) => OfferChange[];
  onRestore: (document: OfferBuilderDocument) => void;
}) {
  const [selected, setSelected] = useState<OfferBuilderRevision | null>(null);
  return (
    <section className="admin-card p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History size={18} /> Saved revisions
      </h2>
      <p className="admin-help">
        Restore a revision into your working copy. The public page changes only
        when you publish.
      </p>
      {history.length ? (
        <ul className="space-y-3">
          {history.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-current/10 p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  Revision {item.version} ·{" "}
                  {item.published ? "Published" : "Draft"}
                </p>
                <time className="admin-help" dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString()}
                </time>
              </div>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setSelected(item)}
              >
                Restore revision {item.version}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-help">
          Your first saved draft starts the revision history.
        </p>
      )}
      <OfferConfirmDialog
        open={!!selected}
        title={`Restore revision ${selected?.version ?? ""}?`}
        description={`Its pages, copy and settings replace your working copy${dirty ? ", including your unsaved changes" : ""}. The public page does not change until you publish.`}
        changes={selected ? compare(selected.document) : undefined}
        noChanges="Price, page URL, download file and follow-up match your working copy."
        confirmLabel="Restore this revision"
        onConfirm={() => {
          if (selected) onRestore(selected.document);
          setSelected(null);
        }}
        onCancel={() => setSelected(null)}
      />
    </section>
  );
}
