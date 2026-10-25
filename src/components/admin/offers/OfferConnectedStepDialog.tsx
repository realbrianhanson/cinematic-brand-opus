import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveOfferBuilder,
  type OfferBuilderSaveInput,
  type OfferBuilderSaveResult,
} from "@/lib/offerBuilderClient";
import { errorMessage } from "@/lib/errorMessage";
import {
  connectedOfferDocument,
  connectedOfferLabels,
  connectedOfferSaveRejected,
  type ConnectedOfferFields,
  type ConnectedOfferRelation,
} from "@/lib/offerConnectedSteps";

export type ConnectedOfferProtection = {
  busy: boolean;
  pending: boolean;
  dirty: boolean;
};

export default function OfferConnectedStepDialog({
  relation,
  parentCurrency,
  parentTitle,
  onCreated,
  onClose,
  onProtectionChange,
}: {
  relation: ConnectedOfferRelation;
  parentCurrency: string;
  parentTitle?: string;
  onCreated: (result: OfferBuilderSaveResult) => void;
  onClose: () => void;
  onProtectionChange?: (value: ConnectedOfferProtection) => void;
}) {
  const [fields, setFields] = useState<ConnectedOfferFields>({
    title: "",
    summary: "",
    kind: "paid",
    price: "",
  });
  const [protection, setProtection] = useState<ConnectedOfferProtection>({
    busy: false,
    pending: false,
    dirty: false,
  });
  const [error, setError] = useState("");
  const request = useRef<OfferBuilderSaveInput | null>(null);
  const state = useRef(protection);
  const completed = useRef(false);
  const protectionCallback = useRef(onProtectionChange);
  protectionCallback.current = onProtectionChange;
  const label = connectedOfferLabels[relation];
  const locked = protection.busy || protection.pending || completed.current;

  function protect(next: ConnectedOfferProtection) {
    state.current = next;
    setProtection(next);
    protectionCallback.current?.(next);
  }

  useEffect(() => {
    protectionCallback.current?.(state.current);
    return () => {
      protectionCallback.current?.({
        busy: false,
        pending: false,
        dirty: false,
      });
    };
  }, []);

  function update(patch: Partial<ConnectedOfferFields>) {
    if (state.current.busy || state.current.pending || completed.current)
      return;
    setFields((current) => ({ ...current, ...patch }));
    protect({ ...state.current, dirty: true });
    setError("");
  }

  function close() {
    if (state.current.busy || state.current.pending) return;
    if (
      state.current.dirty &&
      !window.confirm("Discard the details for this new offer?")
    )
      return;
    onClose();
  }

  async function create() {
    if (state.current.busy || completed.current) return;
    setError("");
    if (!request.current) {
      try {
        request.current = {
          offerId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          expectedOfferUpdatedAt: null,
          expectedDraftVersion: null,
          publish: false,
          document: connectedOfferDocument(relation, parentCurrency, fields),
        };
      } catch (failure) {
        setError(errorMessage(failure));
        return;
      }
    }
    protect({ ...state.current, busy: true, pending: true });
    let result: OfferBuilderSaveResult;
    try {
      result = await saveOfferBuilder(request.current);
    } catch (failure) {
      const rejected = connectedOfferSaveRejected(failure);
      if (rejected) request.current = null;
      protect({ ...state.current, busy: false, pending: !rejected });
      setError(
        rejected
          ? `The draft was not created. ${errorMessage(failure)}`
          : "We could not confirm whether the draft was created. Your details are locked so a second offer cannot be created accidentally. Retry the same save to recover its result and attach the saved draft.",
      );
      return;
    }
    completed.current = true;
    request.current = null;
    protect({ busy: false, pending: false, dirty: false });
    onCreated(result);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto [&>button:last-child]:hidden"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          close();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            Create {relation === "downsell" ? "a" : "an"} {label}
          </DialogTitle>
          <DialogDescription>
            {parentTitle ? `Add a next step to ${parentTitle}. ` : ""}
            This saves a private offer draft and attaches it to your working
            funnel. Finish its page and download before publishing it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <fieldset disabled={locked} className="space-y-4">
            <label className="block text-sm font-medium">
              Offer name
              <input
                className="admin-input mt-2 w-full"
                value={fields.title}
                onChange={(event) => update({ title: event.target.value })}
                maxLength={200}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              What will this help them do?
              <textarea
                className="admin-input mt-2 w-full"
                rows={3}
                value={fields.summary}
                onChange={(event) => update({ summary: event.target.value })}
                maxLength={1000}
                required
              />
            </label>
            {relation !== "bump" && (
              <label className="block text-sm font-medium">
                Offer type
                <select
                  className="admin-input mt-2 w-full"
                  value={fields.kind}
                  onChange={(event) =>
                    update({
                      kind: event.target.value === "free" ? "free" : "paid",
                    })
                  }
                >
                  <option value="paid">Paid download</option>
                  <option value="free">Free download</option>
                </select>
              </label>
            )}
            {fields.kind === "paid" && (
              <label className="block text-sm font-medium">
                Price ({parentCurrency.toUpperCase()})
                <input
                  className="admin-input mt-2 w-full"
                  inputMode="decimal"
                  value={fields.price}
                  onChange={(event) => update({ price: event.target.value })}
                  placeholder="19.00"
                  required
                />
              </label>
            )}
            <p className="admin-help">
              {relation === "bump"
                ? "An order bump is an optional paid extra at checkout. It uses the original offer’s currency and a separate download."
                : "The original download stays available. A paid follow-up uses a separate checkout; customers choose whether to continue."}
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="admin-notice admin-notice-error">
              {error}
            </p>
          )}
          <p className="admin-help">
            Nothing is published here. Save the original funnel afterward to
            keep this connection.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={locked}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={protection.busy || completed.current}
            >
              {protection.busy
                ? "Saving draft…"
                : protection.pending
                  ? "Retry the same save"
                  : "Create draft & attach"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
