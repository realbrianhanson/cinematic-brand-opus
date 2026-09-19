import { useState } from "react";
import { Lock, Mail, Sparkles, ArrowUpRight } from "lucide-react";
import { useReveal, revealStyle } from "@/hooks/useReveal";
import { supabase } from "@/integrations/supabase/client";
import {
  interpretSubscribeResult,
  type SubscribeUiState,
} from "@/lib/newsletterClient";
import { useSiteConfig } from "@/config/SiteConfigContext";

const FinalCTA = () => {
  const siteConfig = useSiteConfig();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeUiState>("idle");
  const [message, setMessage] = useState("");
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: formRef, visible: formVisible } = useReveal();
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
      className="relative py-32 lg:py-40"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div
        className="absolute top-0 left-0 w-full h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 15%, rgba(var(--brand-accent-rgb),0.2) 50%, transparent 85%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(var(--brand-accent-rgb),0.04), transparent 65%)",
        }}
      />

      <div className="relative mx-auto px-6 lg:px-14 max-w-2xl text-center">
        <div ref={headerRef}>
          <h2
            className="font-display mb-5"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
              lineHeight: 1.1,
              color: "#fff",
              ...revealStyle(headerVisible, 0),
            }}
          >
            {newsletter.headingLead}{" "}
            <em
              style={{
                fontStyle: "italic",
                background:
                  "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {newsletter.headingAccent}
            </em>
          </h2>

          <p
            className="font-body mb-10"
            style={{
              fontSize: "1.1rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.85)",
              ...revealStyle(headerVisible, 0.1),
            }}
          >
            {newsletter.intro}
          </p>
        </div>

        <div ref={formRef} style={revealStyle(formVisible, 0)}>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6"
          >
            <label htmlFor="final-cta-email" className="sr-only">
              Email address
            </label>
            <input
              id="final-cta-email"
              type="email"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 font-body outline-none transition-colors duration-300"
              style={{
                fontSize: 14,
                padding: "16px 20px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "rgba(var(--brand-accent-rgb),0.4)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
              }
            />
            <button
              type="submit"
              data-hover
              className="font-body font-bold uppercase shrink-0 transition-opacity duration-300 hover:opacity-90"
              style={{
                fontSize: 13,
                letterSpacing: "0.08em",
                padding: "16px 32px",
                background:
                  "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark))",
                color: "var(--brand-backdrop)",
              }}
              disabled={status === "loading"}
            >
              {status === "loading" ? "…" : "Subscribe"}
            </button>
          </form>

          <p
            className="font-body mb-4"
            role="status"
            aria-live="polite"
            style={{
              fontSize: 13,
              color: isProblem ? "#ff8080" : "var(--brand-accent)",
              minHeight: message ? undefined : 0,
            }}
          >
            {message}
          </p>

          <div className="flex justify-center gap-6 flex-wrap">
            {[
              { icon: Lock, text: "No spam" },
              { icon: Mail, text: "Weekly" },
              { icon: Sparkles, text: "Unsubscribe anytime" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon size={13} color="var(--brand-accent)" />
                <span
                  className="font-body"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>

          {newsletter.secondaryCta && (
            <div className="mt-14">
              {newsletter.secondaryCtaLabel && (
                <div
                  className="inline-block font-body font-semibold uppercase mb-3"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    color: "rgba(255,255,255,0.3)",
                    background: "rgba(var(--brand-accent-rgb),0.06)",
                    border: "1px solid rgba(var(--brand-accent-rgb),0.1)",
                    padding: "5px 14px",
                  }}
                >
                  {newsletter.secondaryCtaLabel}
                </div>
              )}
              <div>
                <a
                  href={newsletter.secondaryCta.href}
                  target={
                    newsletter.secondaryCta.external ? "_blank" : undefined
                  }
                  rel={
                    newsletter.secondaryCta.external
                      ? "noopener noreferrer"
                      : undefined
                  }
                  data-hover
                  className="inline-flex items-center gap-1.5 font-display italic group"
                  style={{ fontSize: "1rem", color: "var(--brand-accent)" }}
                >
                  {newsletter.secondaryCta.label}
                  <ArrowUpRight
                    size={15}
                    className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
