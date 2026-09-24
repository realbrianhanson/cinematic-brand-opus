import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Download, Mail } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import FormPrivacyLink from "@/components/FormPrivacyLink";
import { retryToken } from "@/lib/offers";
import {
  freeOfferButtonLabel,
  optInAfterClaim,
  requestOfferAccess,
  STARTER_KIT_SOURCE,
} from "@/lib/offerClaim";
import type { LeadMagnetOffer } from "@/lib/shop.functions";
import type { SubscribeUiState } from "@/lib/newsletterClient";
import { subscribeToNewsletter } from "@/lib/newsletterSubscribe";
import { dropTrailingPeriod } from "@/lib/copyVoice";

export type ArticleLeadPlacement = "article-mid" | "article-end";

interface ArticleLeadCardProps {
  /** The site's free download. Without one, the card offers the newsletter. */
  offer?: LeadMagnetOffer | null;
  placement: ArticleLeadPlacement;
}

const fieldClass =
  "min-h-12 w-full min-w-0 flex-1 border border-white/25 bg-black/25 px-4 py-3 font-body text-body text-white placeholder:text-white/60 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]";
const buttonClass =
  "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[var(--brand-accent)] px-5 py-3 font-body text-meta font-bold text-[var(--brand-backdrop)] transition-colors hover:bg-[var(--brand-accent-light)] disabled:opacity-60";

/**
 * Compact email capture shown inside articles: the free download when the
 * site has one (claiming it can also start the weekly-email double opt-in),
 * otherwise the weekly email on its own.
 */
export default function ArticleLeadCard({
  offer,
  placement,
}: ArticleLeadCardProps) {
  const usable =
    offer && offer.kind === "free" && offer.checkout_mode === "native";
  return (
    <aside
      aria-label={usable ? "Free download" : "Weekly email"}
      data-article-lead={placement}
      className="not-prose my-12 border border-[rgba(var(--brand-accent-rgb),0.35)] bg-[rgba(var(--brand-accent-rgb),0.06)] p-6 sm:p-8"
    >
      {usable ? (
        <KitSignup offer={offer} placement={placement} />
      ) : (
        <NewsletterSignup placement={placement} />
      )}
    </aside>
  );
}

function KitSignup({
  offer,
  placement,
}: {
  offer: LeadMagnetOffer;
  placement: ArticleLeadPlacement;
}) {
  const { identity } = useSiteConfig();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef<{ identity: string; token: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    if (!email) return;
    const consent = form.get("newsletter") === "yes";
    if (tokenRef.current?.identity !== email)
      tokenRef.current = {
        identity: email,
        token: retryToken(offer.id, email),
      };
    setBusy(true);
    setError("");
    try {
      const result = await requestOfferAccess({
        offerId: offer.id,
        email,
        token: tokenRef.current.token,
      });
      if (result.status === "closed") {
        tokenRef.current = null;
        setError("That request expired. Submit the form again");
        setBusy(false);
        return;
      }
      await optInAfterClaim(
        email,
        consent,
        `${STARTER_KIT_SOURCE}-${placement}`,
      );
      window.location.assign(result.destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again");
      setBusy(false);
    }
  }

  return (
    <>
      <p className="flex items-center gap-2 font-body text-label font-bold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
        <Download size={15} aria-hidden="true" />
        Free download
      </p>
      <h2 className="mt-3 font-display text-title text-white">
        {placement === "article-end"
          ? `Get the free ${offer.title}`
          : offer.title}
      </h2>
      {offer.summary && (
        <p className="mt-3 font-body text-body text-white/80">
          {dropTrailingPeriod(offer.summary)}
        </p>
      )}
      <form method="post" onSubmit={submit} className="mt-5 space-y-3">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            disabled={busy}
            className={fieldClass}
          />
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? "Opening…" : freeOfferButtonLabel(offer)}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <label className="flex items-start gap-3 font-body text-meta text-white/85">
          <input
            type="checkbox"
            name="newsletter"
            value="yes"
            defaultChecked
            disabled={busy}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-accent)]"
          />
          <span>
            Also send me the weekly email from {identity.name}. You’ll get a
            confirmation email first. Unsubscribe in one click
          </span>
        </label>
        {error && (
          <p role="alert" className="font-body text-meta text-red-300">
            {error}
          </p>
        )}
        <p className="font-body text-label text-white/70">
          Your download opens on the next page · <FormPrivacyLink />
        </p>
      </form>
    </>
  );
}

function NewsletterSignup({ placement }: { placement: ArticleLeadPlacement }) {
  const { newsletter } = useSiteConfig();
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubscribeUiState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || state === "loading") return;
    setState("loading");
    setMessage("");
    const result = await subscribeToNewsletter(email, placement);
    setState(result.state);
    setMessage(result.message);
    if (result.state === "confirmation_sent") setEmail("");
  }

  const problem = [
    "unavailable",
    "rate_limited",
    "invalid_email",
    "error",
  ].includes(state);

  return (
    <>
      <p className="flex items-center gap-2 font-body text-label font-bold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
        <Mail size={15} aria-hidden="true" />
        The weekly email
      </p>
      <h2 className="mt-3 font-display text-title text-white">
        {newsletter.headingLead}{" "}
        <em className="text-[var(--brand-accent)]">
          {newsletter.headingAccent}
        </em>
      </h2>
      <p className="mt-3 font-body text-body text-white/80">
        {newsletter.intro}
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className={buttonClass}
        >
          {state === "loading" ? "Joining…" : "Get the weekly email"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
      <p
        role="status"
        aria-live="polite"
        className={`mt-3 font-body text-meta ${problem ? "text-red-300" : "text-[var(--brand-accent)]"}`}
      >
        {message}
      </p>
      <p className="mt-1 font-body text-label text-white/70">
        {newsletter.privacyNote} · <FormPrivacyLink />
      </p>
    </>
  );
}
