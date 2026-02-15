import { useState } from "react";
import { Lock, Mail, Sparkles, ArrowUpRight } from "lucide-react";
import { useReveal, revealStyle } from "@/hooks/useReveal";

const FinalCTA = () => {
  const [email, setEmail] = useState("");
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: formRef, visible: formVisible } = useReveal();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmail("");
  };

  return (
    <section id="contact" className="relative py-32 lg:py-40" style={{ background: "#07070E" }}>
      <div className="absolute top-0 left-0 w-full h-px" style={{
        background: "linear-gradient(90deg, transparent 15%, rgba(212,175,85,0.2) 50%, transparent 85%)",
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, rgba(212,175,85,0.04), transparent 65%)",
      }} />

      <div className="relative mx-auto px-6 lg:px-14 max-w-2xl text-center">
        <div ref={headerRef}>
          <h2 className="font-display mb-5" style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", lineHeight: 1.1, color: "#fff", ...revealStyle(headerVisible, 0) }}>
            Ready for Your{" "}
            <em style={{
              fontStyle: "italic",
              background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Unfair Advantage?
            </em>
          </h2>

          <p className="font-body mb-10" style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "rgba(255,255,255,0.45)", ...revealStyle(headerVisible, 0.1) }}>
            Weekly AI strategies, tools, and frameworks from the front lines. No spam. No fluff. Just what moves the needle.
          </p>
        </div>

        <div ref={formRef} style={revealStyle(formVisible, 0)}>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-6">
            <input
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
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(212,175,85,0.4)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
            />
            <button
              type="submit"
              data-hover
              className="font-body font-bold uppercase shrink-0 transition-opacity duration-300 hover:opacity-90"
              style={{
                fontSize: 13,
                letterSpacing: "0.08em",
                padding: "16px 32px",
                background: "linear-gradient(135deg, #D4AF55, #B8962E)",
                color: "#07070E",
              }}
            >
              Subscribe
            </button>
          </form>

          <div className="flex justify-center gap-6 flex-wrap">
            {[
              { icon: Lock, text: "No spam" },
              { icon: Mail, text: "Weekly" },
              { icon: Sparkles, text: "Unsubscribe anytime" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5">
                <Icon size={12} color="rgba(212,175,85,0.5)" />
                <span className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{text}</span>
              </div>
            ))}
          </div>

          <div className="mt-14">
            <div
              className="inline-block font-body font-semibold uppercase mb-3"
              style={{
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "rgba(255,255,255,0.3)",
                background: "rgba(212,175,85,0.06)",
                border: "1px solid rgba(212,175,85,0.1)",
                padding: "5px 14px",
              }}
            >
              Or skip ahead
            </div>
            <div>
              <a
                href="https://aiforbeginners.com"
                target="_blank"
                rel="noopener noreferrer"
                data-hover
                className="inline-flex items-center gap-1.5 font-display italic group"
                style={{ fontSize: "1rem", color: "#D4AF55" }}
              >
                Join the Free 3-Day AI Event
                <ArrowUpRight size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
