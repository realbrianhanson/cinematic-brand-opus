import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Download, LockKeyhole } from "lucide-react";
import OfferShell from "@/components/OfferShell";
import {
  invokeOfferApi,
  clearOfferAttempt,
  offerPrice,
  persistOfferToken,
  retryToken,
  safeOfferRedirect,
  type OfferClaim,
  type PublicOffer,
} from "@/lib/offers";

const fieldClass =
  "w-full mt-2 rounded border border-white/25 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";
export default function OfferLanding({
  offer,
  preview = false,
}: {
  offer: PublicOffer;
  preview?: boolean;
}) {
  const [ready, setReady] = useState<boolean | null>(
    offer.kind === "free" ? true : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<{ identity: string; token: string } | null>(null);
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
    if (busy || preview || !ready || offer.funnel_only) return;
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
      <div className="grid lg:grid-cols-[1.25fr_0.8fr] gap-10 lg:gap-16 items-start">
        <article>
          <p
            className="text-sm uppercase tracking-widest font-bold mb-4"
            style={{ color: "var(--brand-accent)" }}
          >
            {offer.kind === "free" ? "Free download" : "Digital download"}
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight">
            {offer.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/85">
            {offer.summary}
          </p>
          {offer.cover_url && (
            <img
              src={offer.cover_url}
              alt={offer.title}
              className="mt-8 w-full max-h-[480px] object-contain rounded border border-white/10"
            />
          )}
          <div className="mt-8 space-y-5 text-base leading-relaxed text-white/80">
            {offer.body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
          </div>
        </article>
        <aside className="border border-white/20 bg-white/[0.035] rounded-lg p-6 md:p-8 lg:sticky lg:top-8">
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
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-sm">
                Your name <span className="text-white/60">(optional)</span>
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  className={fieldClass}
                  disabled={busy || preview}
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
                  disabled={busy || preview}
                />
              </label>
              <button
                disabled={busy || preview || ready !== true}
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
                here; it is not automatically emailed.
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
      </div>
    </OfferShell>
  );
}
