import { useState } from "react";
import OfferLanding from "@/pages/OfferLanding";
import OfferBumpChoice from "./OfferBumpChoice";
import OfferSections from "./OfferSections";
import { safeExternalOfferUrl, type PublicOffer } from "@/lib/offers";
import { offerPreviewPrice } from "@/lib/offerCta";
import { readPresentation, type OfferBuilder } from "@/lib/offerBuilder";

export type OfferPreviewStage = "landing" | "upsell" | "thank-you";

export function UpsellPreview({ offer }: { offer: PublicOffer }) {
  const page = readPresentation(offer.presentation)?.upsell;
  return (
    <section className="p-6 text-white md:p-10">
      <p className="text-xs uppercase tracking-widest text-[var(--brand-accent)]">
        {page?.eyebrow || "An optional next step"}
      </p>
      <h2 className="mt-4 font-display text-4xl leading-tight">
        {page?.headline || offer.title || "Your upsell headline"}
      </h2>
      <p className="mt-5 text-lg leading-relaxed text-white/75">
        {page?.subheadline || offer.summary}
      </p>
      {offer.cover_url && (
        <img
          src={offer.cover_url}
          alt={offer.title}
          className="my-6 max-h-64 rounded-lg object-contain"
        />
      )}
      <div className="my-8">
        <OfferSections
          sections={page?.sections || []}
          fallback={offer.body}
          actionLabel={page?.ctaText || "See this offer"}
          preview
        />
      </div>
      <p className="text-xl font-semibold">
        {offerPreviewPrice(offer)}
        {offer.kind === "paid" ? " · one payment" : ""}
      </p>
      {offer.bump_offer && (
        <div className="mt-5">
          <OfferBumpChoice
            offer={offer.bump_offer}
            selected={false}
            disabled
            onChange={() => {}}
          />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled
          className="rounded bg-[var(--brand-accent)] px-5 py-3 font-semibold text-[var(--brand-backdrop)]"
        >
          {page?.ctaText ||
            (offer.kind === "paid"
              ? "Continue to checkout"
              : "Get this free resource")}
          {offer.kind === "paid" ? ` · ${offerPreviewPrice(offer)}` : ""}
        </button>
        <button
          type="button"
          disabled
          className="rounded border border-white/30 px-5 py-3"
        >
          No thanks
        </button>
      </div>
      {page?.ctaMicrocopy && (
        <p className="mt-3 text-sm text-white/70">{page.ctaMicrocopy}</p>
      )}
      {offer.kind === "paid" && (
        <p className="mt-3 text-sm text-white/70">
          A separate checkout confirms this payment.
        </p>
      )}
    </section>
  );
}

function ThanksPreview({
  offer,
  includeBump = false,
}: {
  offer: PublicOffer;
  includeBump?: boolean;
}) {
  const page = readPresentation(offer.presentation)?.thankYou;
  return (
    <section className="p-6 text-white md:p-10">
      <p className="text-xs uppercase tracking-widest text-[var(--brand-accent)]">
        Your resources
      </p>
      <h2 className="mt-4 font-display text-4xl">
        {page?.headline || "Your download is ready"}
      </h2>
      <p className="mt-5 whitespace-pre-line leading-relaxed text-white/75">
        {page?.body || offer.thank_you_message}
      </p>
      <button
        type="button"
        disabled
        className="mt-6 rounded bg-[var(--brand-accent)] px-5 py-3 font-semibold text-[var(--brand-backdrop)]"
      >
        Download file · preview
      </button>
      {includeBump && offer.bump_offer && (
        <div className="mt-5">
          <p className="text-white/75">
            Optional extra purchased: {offer.bump_offer.title}
          </p>
          <button
            type="button"
            disabled
            className="mt-3 rounded border border-white/30 px-5 py-3"
          >
            Download {offer.bump_offer.title} · preview
          </button>
        </div>
      )}
      {page?.firstStep && (
        <div className="mt-8 rounded-lg border border-white/20 p-5">
          <h3 className="font-semibold">Your first step</h3>
          <p className="mt-3 whitespace-pre-line text-white/75">
            {page.firstStep}
          </p>
        </div>
      )}
    </section>
  );
}

/** Local-only preview. No checkout, file, email, tracking or provider requests. */
export default function OfferBuilderPreview({
  offer,
  builder,
  stage = "landing",
  device = "desktop",
  nextOffer = null,
  downsellOffer = null,
  followUpWindowMinutes = 0,
}: {
  offer: PublicOffer;
  builder: OfferBuilder;
  stage?: OfferPreviewStage;
  device?: "desktop" | "phone";
  nextOffer?: PublicOffer | null;
  downsellOffer?: PublicOffer | null;
  followUpWindowMinutes?: number;
}) {
  type Simulation =
    | "page"
    | "purchase"
    | "next"
    | "basket"
    | "ended"
    | "declined"
    | "expired"
    | "pending"
    | "provider";
  const external = offer.checkout_mode === "external";
  const followUp =
    !external && nextOffer?.checkout_mode !== "external" ? nextOffer : null;
  const alternative =
    followUp && downsellOffer?.checkout_mode === "native"
      ? downsellOffer
      : null;
  const previewKey = `${offer.id}:${offer.checkout_mode}:${offer.kind}:${stage}:${followUp?.id || ""}:${alternative?.id || ""}:${offer.bump_offer?.id || ""}:${followUpWindowMinutes > 0}`;
  const [selected, setSelected] = useState<{ key: string; value: Simulation }>({
    key: previewKey,
    value: "page",
  });
  const simulation = selected.key === previewKey ? selected.value : "page";
  const choices: [Simulation, string][] = external
    ? [
        ["page", "Landing page"],
        ["provider", "Provider handoff"],
      ]
    : [
        ["page", "Selected page"],
        [
          "purchase",
          offer.kind === "free" ? "After download" : "After purchase",
        ],
        ...(followUp
          ? ([
              ["next", "Follow-up"],
              ["declined", "Declined"],
            ] as [Simulation, string][])
          : []),
        ...(alternative
          ? ([["ended", "Decline both"]] as [Simulation, string][])
          : []),
        ...(offer.bump_offer
          ? ([["basket", "With checkout extra"]] as [Simulation, string][])
          : []),
        ...(followUp && followUpWindowMinutes > 0
          ? ([["expired", "Expired"]] as [Simulation, string][])
          : []),
        ...(offer.kind === "paid"
          ? ([["pending", "Pending payment"]] as [Simulation, string][])
          : []),
      ];
  const draft = { ...offer, presentation: builder.presentation };
  const destination = safeExternalOfferUrl(offer.external_url);
  return (
    <div className="space-y-3" data-testid="offer-builder-preview">
      <div
        className="flex flex-wrap items-center gap-2 text-xs"
        aria-label="Simulate the customer journey"
      >
        {choices.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={simulation === value}
            onClick={() => setSelected({ key: previewKey, value })}
            className={
              simulation === value
                ? "admin-btn-primary !px-3 !py-2 !text-xs"
                : "admin-btn-secondary !px-3 !py-2 !text-xs"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <p className="admin-help">
        Preview only. Purchases, downloads, and outgoing links are disabled.
      </p>
      <div
        className={`public-theme-preview mx-auto overflow-hidden rounded-xl border border-white/15 bg-[var(--site-surface,#101011)] ${device === "phone" ? "max-w-[390px]" : "w-full"}`}
      >
        <div className="public-site max-h-[75vh] overflow-y-auto [overflow-wrap:anywhere]">
          {simulation === "provider" ? (
            <section className="p-6 text-white md:p-10">
              <h2 className="font-display text-3xl">
                Continue on the provider’s website
              </h2>
              <p className="mt-4 text-white/75">
                {destination
                  ? `The offer button opens ${new URL(destination).hostname} in a new tab.`
                  : "Add a valid HTTPS destination in Delivery to complete this handoff."}
              </p>
              <p className="mt-4 text-white/75">
                The provider handles access, payment, confirmation and any
                follow-up offers. This website does not create a local order or
                download for this offer.
              </p>
              <p className="mt-4 text-sm text-white/65">
                This preview does not load or verify the destination checkout.
              </p>
            </section>
          ) : simulation === "page" ? (
            external || stage === "landing" ? (
              <OfferLanding
                offer={draft}
                preview
                compact={device === "phone"}
              />
            ) : stage === "upsell" ? (
              <UpsellPreview offer={draft} />
            ) : (
              <ThanksPreview offer={draft} />
            )
          ) : simulation === "next" ? (
            followUp ? (
              <>
                {followUp.status !== "published" && (
                  <p className="p-6 pb-0 text-amber-200">
                    This follow-up is not published. Visitors will not see it
                    until it is published.
                  </p>
                )}
                <UpsellPreview offer={followUp} />
              </>
            ) : (
              <p className="p-8 text-white/75">
                Choose a follow-up offer to preview its pitch.
              </p>
            )
          ) : simulation === "pending" ? (
            <div className="p-8 text-white">
              <h2 className="font-display text-3xl">
                Waiting for payment confirmation
              </h2>
              <p className="mt-4 text-white/75">
                The download unlocks only after payment is confirmed. The
                customer can return to checkout or check payment status.
              </p>
            </div>
          ) : (
            <>
              <ThanksPreview
                offer={draft}
                includeBump={simulation === "basket"}
              />
              {simulation === "declined" &&
                alternative &&
                alternative.status === "published" && (
                  <>
                    <p className="px-6 text-white/75">
                      The first follow-up was declined. This optional
                      alternative uses the same original deadline.
                    </p>
                    <UpsellPreview offer={alternative} />
                  </>
                )}
              {simulation === "declined" &&
                alternative &&
                alternative.status !== "published" && (
                  <p className="px-6 text-amber-200">
                    The alternative is not published and will not appear for
                    visitors.
                  </p>
                )}
              {(simulation === "ended" || simulation === "declined") && (
                <p className="px-6 pb-8 text-white/75">
                  Follow-up offer declined. Your original download is still
                  available.
                </p>
              )}
              {simulation === "expired" && (
                <p className="px-6 pb-8 text-white/75">
                  The follow-up offer window has ended. Your original download
                  stays available.
                </p>
              )}
              {simulation === "purchase" && followUp && (
                <>
                  {followUp.status !== "published" && (
                    <p className="px-6 text-amber-200">
                      This follow-up is not published. Visitors will not see it
                      until it is published.
                    </p>
                  )}
                  <UpsellPreview offer={followUp} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
