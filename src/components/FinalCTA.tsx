import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  interpretSubscribeResult,
  type SubscribeUiState,
} from "@/lib/newsletterClient";
import { useSiteConfig } from "@/config/SiteConfigContext";
import FormPrivacyLink from "@/components/FormPrivacyLink";

const FinalCTA = () => {
  const siteConfig = useSiteConfig();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeUiState>("idle");
  const [message, setMessage] = useState("");
  const newsletter = siteConfig.newsletter;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMessage("");

    let httpStatus = 200;
    let payload: unknown = null;
    try {
      const { data, error } = await supabase.functions.invoke(
        "newsletter-subscribe",
        {
          body: { email, source: "final_cta" },
        },
      );
      if (error) {
        const res = error?.context as Response | undefined;
        if (res) {
          httpStatus = res.status;
          payload = await res
            .clone()
            .json()
            .catch(() => null);
        } else {
          httpStatus = 0;
        }
      } else {
        payload = data;
      }
    } catch {
      httpStatus = 0;
    }

    const result = interpretSubscribeResult(httpStatus, payload);
    setStatus(result.state);
    setMessage(result.message);
    if (result.state === "confirmation_sent") setEmail("");
  };

  const isProblem =
    status === "unavailable" ||
    status === "rate_limited" ||
    status === "invalid_email" ||
    status === "error";

  return (
    <section
      id="contact"
      className="border-y border-[rgba(var(--brand-accent-rgb),.2)] bg-[linear-gradient(115deg,rgba(var(--brand-accent-rgb),.1),rgba(var(--brand-accent-rgb),.025))] py-16 lg:py-24"
    >
      <div className="mx-auto grid max-w-[1440px] items-center gap-9 px-6 lg:grid-cols-2 lg:gap-20 lg:px-14">
        <header>
          <p className="mb-5 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
            The weekly email
          </p>
          <h2 className="font-display text-4xl leading-[1.1] text-white lg:text-5xl">
            {newsletter.headingLead}
            <em className="block text-[var(--brand-accent)]">
              {newsletter.headingAccent}
            </em>
          </h2>
          <p className="mt-5 max-w-lg font-body text-base leading-relaxed text-white/70">
            {newsletter.intro}
          </p>
        </header>
        <div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <label
              htmlFor="final-cta-email"
              className="block font-body text-sm font-medium text-white/90"
            >
              Your email address
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="final-cta-email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="min-h-14 min-w-0 flex-1 border border-white/25 bg-black/20 px-4 py-4 font-body text-base text-white outline-offset-4 placeholder:text-white/40 focus:border-[var(--brand-accent)] focus:outline-[var(--brand-accent)]"
              />
              <button
                type="submit"
                className="inline-flex min-h-14 shrink-0 items-center justify-center gap-3 bg-[var(--brand-accent)] px-6 py-4 font-body text-sm font-bold text-[var(--brand-backdrop)] transition-colors hover:bg-[var(--brand-accent-light)] disabled:opacity-60"
                disabled={status === "loading"}
              >
                {status === "loading" ? "Joining…" : "Get the weekly email"}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </form>
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 font-body text-sm ${isProblem ? "text-red-300" : "text-[var(--brand-accent)]"}`}
          >
            {message}
          </p>
          <p className="mt-3 font-body text-xs leading-relaxed text-white/55">
            {newsletter.privacyNote} <FormPrivacyLink />
          </p>
          {newsletter.secondaryCta && (
            <div className="mt-7 border-t border-white/15 pt-5">
              <p className="mb-2 font-body text-xs text-white/60">
                {newsletter.secondaryCtaLabel}
              </p>
              <a
                href={newsletter.secondaryCta.href}
                target={newsletter.secondaryCta.external ? "_blank" : undefined}
                rel={
                  newsletter.secondaryCta.external
                    ? "noopener noreferrer"
                    : undefined
                }
                className="inline-flex min-h-11 items-center gap-2 font-body text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline"
              >
                {newsletter.secondaryCta.label}
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
