import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowRight, ArrowUpRight, Download, LockKeyhole } from "lucide-react";
import OfferShell from "@/components/OfferShell";
import OfferSections from "@/components/offers/OfferSections";
import { readPresentation } from "@/lib/offerBuilder";
import type { ShopOffer } from "@/lib/shop";
import RelatedOffers from "@/components/RelatedOffers";
import { useSiteConfig } from "@/config/SiteConfigContext";
import {
  invokeOfferApi,
  offerPrice,
  retryToken,
  safeExternalOfferUrl,
  affiliateDisclosure,
  type PublicOffer,
} from "@/lib/offers";
import { optInAfterClaim, requestOfferAccess } from "@/lib/offerClaim";
import { offerPrimaryCta, offerPreviewPrice } from "@/lib/offerCta";
import { withTimeout } from "@/lib/withTimeout";

const fieldClass =
  "w-full mt-2 rounded border border-white/25 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";
type OfferLandingProps = {
  offer: PublicOffer;
  preview?: boolean;
  compact?: boolean;
  relatedOffers?: ShopOffer[];
};

export default function OfferLanding(props: OfferLandingProps) {
  return props.offer.checkout_mode === "external" ? (
    <ExternalOfferLanding {...props} />
  ) : (
    <NativeOfferLanding {...props} />
  );
}

function OfferIntro({
  offer,
  compact = false,
  preview = false,
}: {
  offer: PublicOffer;
  compact?: boolean;
  preview?: boolean;
}) {
  const page = readPresentation(offer.presentation)?.landing;
  return (
    <header
      data-conversion-offer-id={offer.id}
      data-conversion-offer-slug={offer.slug}
      className="min-w-0 break-words @3xl:col-start-1"
    >
      <p
        className="text-sm uppercase tracking-widest font-bold mb-4"
        style={{ color: "var(--site-accent-ink, var(--brand-accent))" }}
      >
        {page?.eyebrow ||
          (offer.checkout_mode === "external"
            ? "Explore the offer"
            : offer.kind === "free"
              ? "Free download"
              : "Digital download")}
      </p>
      <h1
        className={`font-display text-4xl ${compact ? "" : "@3xl:text-6xl"} leading-[1.04]`}
      >
        {page?.headline || offer.title}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
        {page?.subheadline || offer.summary}
      </p>
      {!offer.funnel_only && (
        <button
          type="button"
          disabled={preview}
          onClick={() => {
            const action = document.getElementById("offer-action");
            action?.scrollIntoView({ behavior: "smooth", block: "start" });
            action?.focus({ preventScroll: true });
          }}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded bg-[var(--brand-accent)] px-5 py-4 text-center font-semibold text-[var(--brand-backdrop)] @3xl:hidden disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {offer.checkout_mode === "external"
            ? "View offer details"
            : offer.kind === "free"
              ? "Go to download form"
              : "View checkout details"}
          <ArrowRight aria-hidden="true" size={18} className="shrink-0" />
        </button>
      )}
      {offer.cover_url && (
        <img
          src={offer.cover_url}
          alt={offer.title}
          width={1600}
          height={900}
          loading="eager"
          decoding="async"
          className="mt-8 h-auto max-h-[480px] w-full rounded-xl border border-white/15 bg-white/[0.025] object-contain"
        />
      )}
    </header>
  );
}

function OfferDetails({
  offer,
  preview = false,
}: {
  offer: PublicOffer;
  preview?: boolean;
}) {
  const page = readPresentation(offer.presentation)?.landing;
  return (
    <article
      aria-label="Offer details"
      className="min-w-0 break-words border-t border-white/15 pt-8 @3xl:col-start-1 @3xl:row-start-2"
    >
      <OfferSections
        sections={page?.sections || []}
        fallback={offer.body}
        preview={preview}
        actionLabel={offerPrimaryCta(offer)}
        onAction={() => {
          document
            .getElementById("offer-action")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
          document
            .getElementById("offer-action")
            ?.focus({ preventScroll: true });
        }}
      />
    </article>
  );
}

function CheckoutForm({
  preview,
  submit,
  children,
}: {
  preview: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return preview ? (
    <div className="mt-6 space-y-4">{children}</div>
  ) : (
    <form method="post" onSubmit={submit} className="mt-6 space-y-4">
      {children}
    </form>
  );
}

function ExternalOfferAction({
  offer,
  destination,
  preview,
}: {
  offer: PublicOffer;
  destination: string | null;
  preview: boolean;
}) {
  const buttonText = offerPrimaryCta(offer);
  return (
    <>
      {preview ? (
        <button
          type="button"
          aria-label="Preview only"
          disabled
          className="mt-6 w-full rounded border border-white/25 px-4 py-4 font-bold text-sm opacity-50"
        >
          {buttonText}
        </button>
      ) : destination ? (
        <a
          href={destination}
          data-conversion-destination="external_offer"
          data-conversion-placement="offer"
          data-conversion-offer-id={offer.id}
          target="_blank"
          rel={
            offer.is_affiliate
              ? "sponsored noopener noreferrer"
              : "noopener noreferrer"
          }
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded px-4 py-4 text-center font-bold text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{
            background: "var(--brand-accent)",
            color: "var(--brand-backdrop)",
          }}
        >
          <span className="min-w-0">{buttonText}</span>
          <ArrowUpRight size={18} className="shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <p role="status" className="mt-6 text-sm leading-relaxed text-white/80">
          This link isn’t available right now. Check back soon
        </p>
      )}
      {readPresentation(offer.presentation)?.landing.ctaMicrocopy && (
        <p className="mt-3 text-sm text-white/75">
          {readPresentation(offer.presentation)!.landing.ctaMicrocopy}
        </p>
      )}
      {destination && (
        <p className="mt-3 text-xs leading-relaxed text-white/65">
          Opens {new URL(destination).hostname} in a new tab
        </p>
      )}
    </>
  );
}

function ExternalOfferLanding({
  offer,
  preview = false,
  compact = false,
  relatedOffers = [],
}: OfferLandingProps) {
  const destination = offer.funnel_only
    ? null
    : safeExternalOfferUrl(offer.external_url);
  const disclosure = affiliateDisclosure(offer);
  return (
    <OfferShell
      focused={readPresentation(offer.presentation)?.landing.focusMode}
      preview={preview}
    >
      {preview && (
        <div
          className="mb-8 border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100"
          role="status"
        >
          Admin preview — the external link is disabled. This does not publish
          the page.
        </div>
      )}
      <div
        className={
          compact
            ? "flex flex-col gap-8 [&>aside]:w-full"
            : "grid @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)] gap-y-8 gap-x-10 @3xl:gap-x-16 items-start"
        }
      >
        <OfferIntro offer={offer} compact={compact} preview={preview} />
        <aside
          id="offer-action"
          tabIndex={-1}
          className={`min-w-0 break-words border border-white/20 bg-white/[0.035] rounded-xl p-6 ${compact ? "" : "@3xl:p-8 @3xl:sticky @3xl:top-8 @3xl:col-start-2 @3xl:row-start-1 @3xl:row-span-2"}`}
        >
          <ArrowUpRight
            size={25}
            aria-hidden="true"
            style={{ color: "var(--site-accent-ink, var(--brand-accent))" }}
          />
          <h2 className="font-display text-3xl mt-4">
            {preview ? offerPreviewPrice(offer) : offerPrice(offer)}
          </h2>
          <p className="text-sm leading-relaxed mt-3 text-white/80">
            {offer.kind === "free"
              ? "Continue to the linked page for details and next steps"
              : "Review what’s included, current pricing and available next steps on the linked website"}
          </p>
          {disclosure && (
            <p className="mt-6 rounded border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5 p-4 text-sm leading-relaxed text-white/90 whitespace-pre-line">
              {disclosure}
            </p>
          )}
          <ExternalOfferAction
            offer={offer}
            destination={destination}
            preview={preview}
          />
        </aside>
        <OfferDetails offer={offer} preview={preview} />
        <div className="min-w-0 break-words border-t border-white/15 pt-2 @3xl:col-start-1 @3xl:row-start-3">
          {disclosure && (
            <p className="text-sm leading-relaxed text-white/80 whitespace-pre-line">
              {disclosure}
            </p>
          )}
          <ExternalOfferAction
            offer={offer}
            destination={destination}
            preview={preview}
          />
        </div>
      </div>
      {!preview &&
        !offer.funnel_only &&
        !readPresentation(offer.presentation)?.landing.focusMode && (
          <RelatedOffers offers={relatedOffers} />
        )}
    </OfferShell>
  );
}

function NativeOfferLanding({
  offer,
  preview = false,
  compact = false,
  relatedOffers = [],
}: OfferLandingProps) {
  const { footer, identity } = useSiteConfig();
  const [hydrated, setHydrated] = useState(false);
  const [readiness, setReadiness] = useState<
    "checking" | "ready" | "unavailable" | "error"
  >(offer.kind === "free" ? "ready" : "checking");
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const checkingAvailability = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<{ identity: string; token: string } | null>(null);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (preview) return;
    if (offer.kind === "free") {
      setReadiness("ready");
      return;
    }
    let active = true;
    checkingAvailability.current = true;
    setReadiness("checking");
    withTimeout(
      invokeOfferApi<{ offer: PublicOffer | null; payments_ready: boolean }>({
        action: "get",
        slug: offer.slug,
      }),
      15000,
    )
      .then((result) => {
        if (typeof result?.payments_ready !== "boolean")
          throw new Error("Availability could not be checked.");
        if (active)
          setReadiness(result.payments_ready ? "ready" : "unavailable");
      })
      .catch(() => {
        if (active) setReadiness("error");
      })
      .finally(() => {
        if (active) checkingAvailability.current = false;
      });
    return () => {
      active = false;
    };
  }, [offer.kind, offer.slug, preview, availabilityAttempt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !hydrated ||
      busy ||
      preview ||
      readiness !== "ready" ||
      offer.funnel_only
    )
      return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const name = String(form.get("name") || "").trim();
    if (tokenRef.current?.identity !== email)
      tokenRef.current = {
        identity: email,
        token: retryToken(offer.id, email),
      };
    const token = tokenRef.current.token;
    const consent = offer.kind === "free" && form.get("newsletter") === "yes";
    setBusy(true);
    setError("");
    try {
      const result = await requestOfferAccess({
        offerId: offer.id,
        email,
        name,
        token,
      });
      if (result.status === "closed") {
        tokenRef.current = null;
        setError(
          "Your previous checkout is closed. Submit this form again to start a new purchase",
        );
        setBusy(false);
        return;
      }
      await optInAfterClaim(email, consent);
      window.location.assign(result.destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again");
      setBusy(false);
    }
  }
  return (
    <OfferShell
      focused={readPresentation(offer.presentation)?.landing.focusMode}
      preview={preview}
    >
      {preview && (
        <div
          className="mb-8 border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100"
          role="status"
        >
          Admin preview — forms are disabled. This does not publish the page or
          create an order.
        </div>
      )}
      <div
        className={
          compact
            ? "flex flex-col gap-8 [&>aside]:w-full"
            : "grid @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)] gap-y-8 gap-x-10 @3xl:gap-x-16 items-start"
        }
      >
        <OfferIntro offer={offer} compact={compact} preview={preview} />
        <aside
          id="offer-action"
          tabIndex={-1}
          className={`min-w-0 break-words border border-white/20 bg-white/[0.035] rounded-xl p-6 ${compact ? "" : "@3xl:p-8 @3xl:sticky @3xl:top-8 @3xl:col-start-2 @3xl:row-start-1 @3xl:row-span-2"}`}
        >
          <Download
            size={25}
            aria-hidden="true"
            style={{ color: "var(--site-accent-ink, var(--brand-accent))" }}
          />
          <h2 className="font-display text-3xl mt-4">
            {preview ? offerPreviewPrice(offer) : offerPrice(offer)}
          </h2>
          <p className="text-sm leading-relaxed mt-3 text-white/75">
            {offer.kind === "free"
              ? "Enter your email and your download opens on the next page"
              : "One payment. Your access opens once the payment is confirmed"}
          </p>
          {offer.funnel_only ? (
            <p className="mt-6 text-white/80">
              This offer comes as a follow-up to another resource. Use the link
              on your download page to continue
            </p>
          ) : (
            <CheckoutForm preview={preview} submit={submit}>
              <label className="block text-sm">
                Your name <span className="text-white/60">(optional)</span>
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  className={fieldClass}
                  disabled={!hydrated || busy || preview}
                />
              </label>
              <label className="block text-sm">
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  className={fieldClass}
                  disabled={!hydrated || busy || preview}
                />
              </label>
              {offer.kind === "free" && (
                <NewsletterConsent
                  owner={identity.name}
                  disabled={!hydrated || busy || preview}
                />
              )}
              <button
                type="submit"
                aria-label={preview ? "Preview only" : undefined}
                disabled={!hydrated || busy || preview || readiness !== "ready"}
                className="w-full inline-flex items-center justify-center gap-2 rounded px-4 py-4 font-bold text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-backdrop)",
                }}
              >
                {busy
                  ? "Opening…"
                  : offer.kind === "free"
                    ? offerPrimaryCta(offer)
                    : `${offerPrimaryCta(offer)} · ${preview ? offerPreviewPrice(offer) : offerPrice(offer)}`}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              {readPresentation(offer.presentation)?.landing.ctaMicrocopy && (
                <p className="text-sm text-white/75">
                  {readPresentation(offer.presentation)!.landing.ctaMicrocopy}
                </p>
              )}
              <noscript>
                <p className="text-sm text-white/75">
                  Enable JavaScript to request this resource or start checkout
                </p>
              </noscript>
              {offer.kind === "paid" && !preview && readiness !== "ready" && (
                <div className="text-sm text-white/75">
                  <p role="status">
                    {readiness === "checking"
                      ? "Checking availability…"
                      : readiness === "error"
                        ? "We couldn’t check checkout availability. Your details are still here."
                        : "Purchases are not available yet. Check back soon"}
                  </p>
                  {readiness === "error" && (
                    <button
                      type="button"
                      className="mt-3 rounded border border-white/30 px-4 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                      onClick={() => {
                        if (checkingAvailability.current) return;
                        checkingAvailability.current = true;
                        setReadiness("checking");
                        setAvailabilityAttempt((attempt) => attempt + 1);
                      }}
                    >
                      Check again
                    </button>
                  )}
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                  {tokenRef.current && (
                    <a
                      className="block mt-2 underline"
                      href={`/offer-access#token=${tokenRef.current.token}`}
                    >
                      Check my download or payment status
                    </a>
                  )}
                </p>
              )}
              <p className="text-xs text-white/70 leading-relaxed">
                We use your email to deliver this{" "}
                {offer.kind === "free"
                  ? "download and, if you opt in, the weekly email"
                  : "purchase"}
                {footer.privacyUrl && (
                  <>
                    {" · "}
                    <a
                      href={preview ? undefined : footer.privacyUrl}
                      className="underline underline-offset-4"
                    >
                      Privacy policy
                    </a>
                  </>
                )}
              </p>
              {offer.kind === "paid" && (
                <p className="text-xs text-white/70 flex items-center gap-2">
                  <LockKeyhole size={13} aria-hidden="true" />
                  Payment is handled by Stripe
                </p>
              )}
            </CheckoutForm>
          )}
        </aside>
        <OfferDetails offer={offer} preview={preview} />
        {!offer.funnel_only && (
          <div className="min-w-0 border-t border-white/15 pt-6 @3xl:col-start-1 @3xl:row-start-3">
            <p className="text-lg font-semibold">
              {preview ? offerPreviewPrice(offer) : offerPrice(offer)}
              {offer.kind === "paid" ? " · one payment" : ""}
            </p>
            <button
              type="button"
              disabled={preview}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-[var(--brand-accent)] px-6 py-4 font-semibold text-[var(--brand-backdrop)] @sm:w-auto disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              onClick={() => {
                const action = document.getElementById("offer-action");
                action?.scrollIntoView({ behavior: "smooth", block: "center" });
                action?.focus({ preventScroll: true });
              }}
            >
              {offer.kind === "free"
                ? "Back to the download form"
                : "Review checkout details"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {!preview &&
        !offer.funnel_only &&
        !readPresentation(offer.presentation)?.landing.focusMode && (
          <RelatedOffers offers={relatedOffers} />
        )}
    </OfferShell>
  );
}

/**
 * Explicit, pre-checked consent for the weekly email. Unchecking it is
 * respected: the claim still works and nothing is sent to the newsletter.
 */
function NewsletterConsent({
  owner,
  disabled,
}: {
  owner: string;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-relaxed text-white/85">
      <input
        type="checkbox"
        name="newsletter"
        value="yes"
        defaultChecked
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-accent)]"
      />
      <span>
        Also send me the weekly email from {owner}
        <span className="block text-xs text-white/70">
          You’ll get a confirmation email first. Unsubscribe in one click
        </span>
      </span>
    </label>
  );
}
