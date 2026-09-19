import { measurementForClaim } from "@/lib/measurement";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Download, LockKeyhole } from "lucide-react";
import OfferShell from "@/components/OfferShell";
import { offerBodyBlocks } from "@/lib/offerBody";
import type { ShopOffer } from "@/lib/shop";
import RelatedOffers from "@/components/RelatedOffers";
import { useSiteConfig } from "@/config/SiteConfigContext";
import {
  invokeOfferApi,
  clearOfferAttempt,
  offerPrice,
  persistOfferToken,
  retryToken,
  safeOfferRedirect,
  safeExternalOfferUrl,
  affiliateDisclosure,
  type OfferClaim,
  type PublicOffer,
} from "@/lib/offers";

const fieldClass =
  "w-full mt-2 rounded border border-white/25 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";
type OfferLandingProps = {
  offer: PublicOffer;
  preview?: boolean;
  relatedOffers?: ShopOffer[];
};

export default function OfferLanding(props: OfferLandingProps) {
  return props.offer.checkout_mode === "external" ? (
    <ExternalOfferLanding {...props} />
  ) : (
    <NativeOfferLanding {...props} />
  );
}

function OfferIntro({ offer }: { offer: PublicOffer }) {
  return (
    <header
      data-conversion-offer-id={offer.id}
      data-conversion-offer-slug={offer.slug}
      className="min-w-0 break-words lg:col-start-1"
    >
      <p
        className="text-sm uppercase tracking-widest font-bold mb-4"
        style={{ color: "var(--brand-accent)" }}
      >
        {offer.checkout_mode === "external"
          ? "Explore the offer"
          : offer.kind === "free"
            ? "Free download"
            : "Digital download"}
      </p>
      <h1 className="font-display text-4xl md:text-6xl leading-[1.04]">
        {offer.title}
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
        {offer.summary}
      </p>
    </header>
  );
}

function OfferDetails({ offer }: { offer: PublicOffer }) {
  return (
    <article
      aria-label="Offer details"
      className="min-w-0 break-words border-t border-white/15 pt-8 lg:col-start-1 lg:row-start-2"
    >
      {offer.cover_url && (
        <img
          src={offer.cover_url}
          alt={offer.title}
          className="mb-8 w-full max-h-[480px] object-contain rounded-lg border border-white/10"
        />
      )}
      <div className="space-y-5 text-base leading-relaxed text-white/75">
        {offerBodyBlocks(offer.body).map((block, i) =>
          block.type === "heading" ? (
            <h2
              key={i}
              className="pt-4 font-display text-3xl leading-tight text-white"
            >
              {block.text}
            </h2>
          ) : block.type === "list" ? (
            <ul
              key={i}
              className="space-y-3 pl-5 list-disc marker:text-[var(--brand-accent)]"
            >
              {block.items.map((item, index) => (
                <li key={index} className="pl-1">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {block.text}
            </p>
          ),
        )}
      </div>
    </article>
  );
}

function ExternalOfferLanding({
  offer,
  preview = false,
  relatedOffers = [],
}: OfferLandingProps) {
  const destination = offer.funnel_only
    ? null
    : safeExternalOfferUrl(offer.external_url);
  const disclosure = affiliateDisclosure(offer);
  const buttonText = offer.external_button_text.trim() || "Visit website";
  return (
    <OfferShell>
      {preview && (
        <div
          className="mb-8 border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100"
          role="status"
        >
          Admin preview — the external link is disabled. This does not publish
          the page.
        </div>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)] gap-y-8 gap-x-10 lg:gap-x-16 items-start">
        <OfferIntro offer={offer} />
        <aside className="min-w-0 break-words border border-white/20 bg-white/[0.035] rounded-xl p-6 md:p-8 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <ArrowUpRight
            size={25}
            aria-hidden="true"
            style={{ color: "var(--brand-accent)" }}
          />
          <h2 className="font-display text-3xl mt-4">{offerPrice(offer)}</h2>
          <p className="text-sm leading-relaxed mt-3 text-white/80">
            {offer.kind === "free"
              ? "Continue to the provider’s website for access and availability."
              : "See what’s included, review the current terms, and complete your purchase on the linked website."}
          </p>
          {disclosure && (
            <p className="mt-6 rounded border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5 p-4 text-sm leading-relaxed text-white/90 whitespace-pre-line">
              {disclosure}
            </p>
          )}
          {preview ? (
            <button
              type="button"
              disabled
              className="mt-6 w-full rounded border border-white/25 px-4 py-4 font-bold text-sm opacity-50"
            >
              Preview only
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
            <p
              role="status"
              className="mt-6 text-sm leading-relaxed text-white/80"
            >
              This offer’s destination is not available right now. Please check
              back soon.
            </p>
          )}
          {destination && (
            <p className="mt-3 text-xs leading-relaxed text-white/65">
              Opens {new URL(destination).hostname} in a new tab.
            </p>
          )}
        </aside>
        <OfferDetails offer={offer} />
      </div>
      {!preview && !offer.funnel_only && (
        <RelatedOffers offers={relatedOffers} />
      )}
    </OfferShell>
  );
}

function NativeOfferLanding({
  offer,
  preview = false,
  relatedOffers = [],
}: OfferLandingProps) {
  const { footer } = useSiteConfig();
  const [hydrated, setHydrated] = useState(false);
  const [ready, setReady] = useState<boolean | null>(
    offer.kind === "free" ? true : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<{ identity: string; token: string } | null>(null);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (preview || offer.kind === "free") return;
    let active = true;
    invokeOfferApi<{ offer: PublicOffer | null; payments_ready: boolean }>({
      action: "get",
      slug: offer.slug,
    })
      .then((result) => {
        if (active) setReady(result.payments_ready);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, [offer.kind, offer.slug, preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || busy || preview || !ready || offer.funnel_only) return;
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
    persistOfferToken(token);
    setBusy(true);
    setError("");
    try {
      const result = await invokeOfferApi<OfferClaim>({
        action: "claim",
        measurement: await measurementForClaim(),
        offer_id: offer.id,
        email,
        name,
        token,
      });
      if (["expired", "failed", "refunded"].includes(result.status)) {
        clearOfferAttempt(offer.id, email);
        tokenRef.current = null;
        setError(
          "Your previous checkout is closed. Submit this form again to start a new purchase.",
        );
        setBusy(false);
        return;
      }
      window.location.assign(
        safeOfferRedirect(result.checkout_url || result.access_url),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <OfferShell>
      {preview && (
        <div
          className="mb-8 border border-amber-300/40 bg-amber-300/10 p-4 text-amber-100"
          role="status"
        >
          Admin preview — forms are disabled. This does not publish the page or
          create an order.
        </div>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)] gap-y-8 gap-x-10 lg:gap-x-16 items-start">
        <OfferIntro offer={offer} />
        <aside className="min-w-0 break-words border border-white/20 bg-white/[0.035] rounded-xl p-6 md:p-8 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <Download
            size={25}
            aria-hidden="true"
            style={{ color: "var(--brand-accent)" }}
          />
          <h2 className="font-display text-3xl mt-4">{offerPrice(offer)}</h2>
          <p className="text-sm leading-relaxed mt-3 text-white/75">
            {offer.kind === "free"
              ? "Enter your details to unlock your download on the next page."
              : "One payment. Get access after your payment is confirmed."}
          </p>
          {offer.funnel_only ? (
            <p className="mt-6 text-white/80">
              This offer is available as a follow-up to another resource. Use
              the link on your download page to continue.
            </p>
          ) : (
            <form method="post" onSubmit={submit} className="mt-6 space-y-4">
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
              <button
                disabled={!hydrated || busy || preview || ready !== true}
                className="w-full inline-flex items-center justify-center gap-2 rounded px-4 py-4 font-bold text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-backdrop)",
                }}
              >
                {busy
                  ? "Opening…"
                  : preview
                    ? "Preview only"
                    : offer.kind === "free"
                      ? "Get my free download"
                      : `Continue to checkout · ${offerPrice(offer)}`}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <noscript>
                <p className="text-sm text-white/75">
                  Enable JavaScript to securely request this resource or start
                  checkout.
                </p>
              </noscript>
              {offer.kind === "paid" && !preview && ready !== true && (
                <p role="status" className="text-sm text-white/75">
                  {ready === null
                    ? "Checking availability…"
                    : "Purchases are not available yet. Please check back soon."}
                </p>
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
              <p className="text-xs text-white/65 leading-relaxed">
                Your details are shared with the site owner for this request.
                This does not sign you up for a newsletter. Your download opens
                here, and we’ll attempt to email a private access link when
                email delivery is available. Save the link shown on your
                download page as a backup.
                {footer.privacyUrl && (
                  <>
                    {" "}
                    <a
                      href={footer.privacyUrl}
                      className="underline underline-offset-4"
                    >
                      Privacy policy
                    </a>
                    .
                  </>
                )}
              </p>
              {offer.kind === "paid" && (
                <p className="text-xs text-white/70 flex items-center gap-2">
                  <LockKeyhole size={13} aria-hidden="true" />
                  Payment is handled by Stripe.
                </p>
              )}
            </form>
          )}
        </aside>
        <OfferDetails offer={offer} />
      </div>
      {!preview && !offer.funnel_only && (
        <RelatedOffers offers={relatedOffers} />
      )}
    </OfferShell>
  );
}
