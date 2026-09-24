import type { OfferStatusChange, OfferStatusRow } from "@/lib/offersStatus";
import OfferStatusActions from "./OfferStatusActions";

const statusText: Record<string, string> = {
  draft: "Draft · private, not visible to visitors",
  published: "Published · visitors can open and claim it",
  archived: "Archived · hidden from visitors and the Shop",
};

/** Current public status and the direct status actions for a saved offer. */
export default function OfferReviewStatus({
  offer,
  disabled,
  onChanged,
  onError,
}: {
  offer: (OfferStatusRow & { title: string }) | null;
  disabled: boolean;
  onChanged: (row: OfferStatusRow, change: OfferStatusChange) => void;
  onError: (message: string) => void;
}) {
  if (!offer)
    return (
      <p className="admin-help mt-2">
        Public status: not saved yet. Save a draft or publish to create it.
      </p>
    );
  return (
    <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
      <p className="text-sm">
        <strong>Public status:</strong>{" "}
        {statusText[offer.status] || offer.status}
      </p>
      <p className="admin-help">
        Unpublish returns the offer to a private draft. Archive hides it and
        stops new claims. Both keep your saved draft and existing customers’
        access. Publishing an archived offer makes it public again.
      </p>
      <div className="flex flex-wrap gap-2">
        <OfferStatusActions
          offer={offer}
          disabled={disabled}
          onChanged={onChanged}
          onError={onError}
        />
      </div>
    </div>
  );
}
