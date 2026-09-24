import { useState } from "react";
import { errorMessage } from "@/lib/errorMessage";
import {
  changeOfferStatus,
  statusChangeCopy,
  statusChanges,
  type OfferStatusChange,
  type OfferStatusRow,
} from "@/lib/offersStatus";
import OfferConfirmDialog from "./OfferConfirmDialog";

/** Unpublish, archive and restore, each confirmed before it runs. */
export default function OfferStatusActions({
  offer,
  disabled = false,
  onChanged,
  onError,
}: {
  offer: OfferStatusRow & { title: string };
  disabled?: boolean;
  onChanged: (row: OfferStatusRow, change: OfferStatusChange) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<OfferStatusChange | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = pending ? statusChangeCopy[pending] : null;
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const row = await changeOfferStatus(offer, pending);
      onChanged(row, pending);
      setPending(null);
    } catch (failure) {
      onError(errorMessage(failure));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {statusChanges(offer.status).map((change) => (
        <button
          key={change}
          type="button"
          className="admin-btn-ghost"
          disabled={disabled || busy}
          aria-label={`${statusChangeCopy[change].button}: ${offer.title || "Untitled offer"}`}
          onClick={() => setPending(change)}
        >
          {statusChangeCopy[change].button}
        </button>
      ))}
      <OfferConfirmDialog
        open={!!copy}
        title={copy?.title ?? ""}
        description={
          <>
            <strong>{offer.title || "Untitled offer"}</strong>. {copy?.detail}
          </>
        }
        confirmLabel={busy ? "Saving…" : (copy?.confirm ?? "")}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
