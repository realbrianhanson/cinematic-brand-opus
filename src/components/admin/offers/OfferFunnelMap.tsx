import { ArrowDown, ArrowRight, ExternalLink, Plus } from "lucide-react";
import type { Form } from "../offerEditorState";
import type { ConnectedOfferRelation } from "@/lib/offerConnectedSteps";

export type OfferFunnelMapChoice = {
  id: string;
  title: string;
  status: string;
  hasUnpublishedDraft?: boolean;
};

export default function OfferFunnelMap({
  form,
  choices,
  onGo,
  onCreate,
  onEdit,
  disabled = false,
  choicesPending = false,
  choicesError = false,
}: {
  form: Pick<
    Form,
    | "title"
    | "kind"
    | "checkoutMode"
    | "bumpOffer"
    | "nextOffer"
    | "downsellOffer"
  >;
  choices: OfferFunnelMapChoice[];
  onGo: (
    step: "pages" | "delivery" | "next",
    stage?: "landing" | "upsell" | "thank-you",
  ) => void;
  onCreate: (relation: ConnectedOfferRelation) => void;
  onEdit: (relation: ConnectedOfferRelation, id: string) => void;
  disabled?: boolean;
  choicesPending?: boolean;
  choicesError?: boolean;
}) {
  const external = form.checkoutMode === "external";

  function connection(
    relation: ConnectedOfferRelation,
    id: string,
    title: string,
    description: string,
  ) {
    const choice = choices.find((candidate) => candidate.id === id);
    const unavailable = !!id && (!choice || choicesPending || choicesError);
    const status = choicesPending
      ? "Checking saved offer…"
      : choicesError
        ? "Offer status unavailable"
        : !choice
          ? "Selected offer unavailable"
          : choice.status === "published"
            ? choice.hasUnpublishedDraft
              ? "Published · newer draft"
              : "Published page"
            : choice.status === "archived"
              ? "Archived · unavailable"
              : "Draft · not published";
    return (
      <div className="min-w-0 rounded-xl border border-current/15 p-4 space-y-3">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="admin-help">{description}</p>
        {id ? (
          <>
            <p className="text-sm font-medium break-words">
              {choice?.title || "Selected offer"}
            </p>
            <p className="admin-help">{status}</p>
            <button
              type="button"
              className="admin-btn-ghost h-auto whitespace-normal text-left"
              disabled={disabled || unavailable}
              onClick={() => onEdit(relation, id)}
            >
              Save funnel &amp; edit {choice?.title || "offer"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="admin-btn-ghost h-auto whitespace-normal"
            disabled={disabled || (relation === "downsell" && !form.nextOffer)}
            onClick={() => onCreate(relation)}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            {relation === "bump"
              ? "Create order bump"
              : relation === "upsell"
                ? "Create upsell"
                : "Create downsell"}
          </button>
        )}
        <button
          type="button"
          className="admin-btn-ghost h-auto whitespace-normal text-left text-xs"
          disabled={disabled || (relation === "downsell" && !form.nextOffer)}
          onClick={() => onGo("next")}
        >
          {id
            ? `Change ${title.toLowerCase()}`
            : `Choose existing ${title.toLowerCase()}`}
        </button>
      </div>
    );
  }

  return (
    <section
      className="admin-card p-5 md:p-6 space-y-5"
      aria-label="Funnel map"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Your funnel at a glance</h2>
          <p className="admin-help">
            Build each step here, then check launch readiness before sharing.
          </p>
        </div>
        <span className="rounded-full border border-current/15 px-3 py-1 text-xs">
          Working draft
        </span>
      </div>
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <li className="min-w-0 rounded-xl border border-current/15 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            01 · Invite
          </p>
          <h3 className="font-semibold">Landing page</h3>
          <p className="text-sm break-words">{form.title || "Your offer"}</p>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={disabled}
            onClick={() => onGo("pages", "landing")}
          >
            Edit landing page{" "}
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </li>
        <li className="min-w-0 rounded-xl border border-current/15 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            02 · {external ? "Continue" : "Get the offer"}
          </p>
          <h3 className="font-semibold">
            {external
              ? "Provider handoff"
              : form.kind === "paid"
                ? "Checkout"
                : "Email signup"}
          </h3>
          <p className="admin-help">
            {external
              ? "Visitors continue to your linked checkout or registration page."
              : form.kind === "paid"
                ? "Customers review the price and choose whether to purchase."
                : "Visitors request the free download. An optional paid extra, if selected, opens checkout."}
          </p>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={disabled}
            onClick={() => onGo("delivery")}
          >
            {external ? "Edit destination" : "Edit delivery & price"}
            {external && <ExternalLink className="size-4" aria-hidden="true" />}
          </button>
          {!external &&
            connection(
              "bump",
              form.bumpOffer,
              "Order bump",
              "Optional extra at checkout. Uses the same currency and unlocks its own download.",
            )}
        </li>
        <li className="min-w-0 rounded-xl border border-current/15 p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            03 · {external ? "Provider owns the next steps" : "Deliver first"}
          </p>
          <h3 className="font-semibold">
            {external ? "Provider confirmation" : "Thank-you + download"}
          </h3>
          <p className="admin-help">
            {external
              ? "Your provider handles confirmation, access and any follow-up offers. Check that experience separately."
              : "Give customers access to their original download before showing an optional next offer."}
          </p>
          {!external && (
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={disabled}
              onClick={() => onGo("pages", "thank-you")}
            >
              Edit thank-you page
            </button>
          )}
        </li>
      </ol>
      {!external && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ArrowDown className="size-4" aria-hidden="true" /> After delivery ·
            optional next steps
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {connection(
              "upsell",
              form.nextOffer,
              "Upsell",
              "A useful next offer after delivery. Paid follow-ups use a separate checkout.",
            )}
            {connection(
              "downsell",
              form.downsellOffer,
              "Downsell",
              form.nextOffer
                ? "Shown only if the customer declines the upsell. Declining this ends the offer sequence."
                : "Add an upsell first, then offer an alternative after a customer declines it.",
            )}
          </div>
          <p className="admin-help">
            Creating a step saves it as a private draft. Finish and publish each
            connected offer, then save and publish this funnel’s connections. A
            published page alone does not confirm checkout is ready.
          </p>
        </div>
      )}
    </section>
  );
}
