import { ArrowRight } from "lucide-react";
import brianPortrait from "@/assets/brian-headshot.jpeg";

const FinalCTA = () => {
  return (
    <section
      id="final-cta"
      className="relative py-28 lg:py-36"
      style={{ background: "var(--bg-warm)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 20% 50%, rgba(241,216,155,0.10), transparent 60%)",
        }}
      />
      <div className="relative mx-auto px-6 lg:px-14" style={{ maxWidth: 1240 }}>
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Portrait */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start">
            <div className="relative" style={{ width: "min(380px, 100%)", aspectRatio: "4/5" }}>
              <div
                className="relative w-full h-full overflow-hidden"
                style={{ background: "var(--bg-section)", border: "1px solid var(--hairline)" }}
              >
                <img src={brianPortrait} alt="Brian Hanson" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse 60% 50% at 50% 25%, rgba(241,216,155,0.2), transparent 65%), linear-gradient(180deg, transparent 55%, rgba(9,9,11,0.65) 100%)",
                  }}
                />
              </div>
              {/* Brackets */}
              {[
                { top: -1, left: -1, v: "top", h: "left" },
                { top: -1, right: -1, v: "top", h: "right" },
                { bottom: -1, left: -1, v: "bottom", h: "left" },
                { bottom: -1, right: -1, v: "bottom", h: "right" },
              ].map((c, i) => (
                <div
                  key={i}
                  className="absolute pointer-events-none"
                  style={{
                    width: 26, height: 26,
                    top: (c as any).top, left: (c as any).left,
                    right: (c as any).right, bottom: (c as any).bottom,
                    borderTop: c.v === "top" ? "1.5px solid var(--gold)" : undefined,
                    borderBottom: c.v === "bottom" ? "1.5px solid var(--gold)" : undefined,
                    borderLeft: c.h === "left" ? "1.5px solid var(--gold)" : undefined,
                    borderRight: c.h === "right" ? "1.5px solid var(--gold)" : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Copy */}
          <div className="lg:col-span-7">
            <div className="flex items-center gap-4 mb-7">
              <div style={{ width: 50, height: 2, background: "var(--gold-gradient)" }} />
              <span
                className="font-body font-semibold uppercase"
                style={{ fontSize: 11, letterSpacing: "0.22em", color: "var(--gold)" }}
              >
                A Personal Invitation
              </span>
            </div>
            <h2
              className="font-display"
              style={{
                fontSize: "clamp(2.25rem, 5.5vw, 4.2rem)",
                lineHeight: 1.05,
                fontWeight: 500,
              }}
            >
              The Tools Caught Up.{" "}
              <span className="gold-italic" style={{ fontWeight: 600 }}>Your Turn.</span>
            </h2>
            <p
              className="mt-7 max-w-xl"
              style={{ fontSize: "1.1rem", lineHeight: 1.75, color: "var(--warm-body)" }}
            >
              For most of my career, the people with vision didn't have the tools — and the people
              with the tools didn't have the vision. That equation just flipped. If you've been
              waiting for the right moment, it's now. Come spend three days with me. I'll show you
              exactly what to do next.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <a
                href="https://aiforbeginners.com"
                target="_blank"
                rel="noopener noreferrer"
                data-hover
                className="inline-flex items-center gap-2 font-body font-bold uppercase rounded-sm"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.12em",
                  background: "linear-gradient(135deg, #f1d89b, #d8b46a 60%, #9c7c3c)",
                  color: "#0b0a09",
                  padding: "20px 38px",
                  boxShadow: "0 18px 48px -18px rgba(216,180,106,0.55)",
                }}
              >
                Claim Your Free Seat
                <ArrowRight size={15} strokeWidth={2.5} />
              </a>
            </div>
            <div className="mt-10">
              <div
                className="font-display italic"
                style={{ fontSize: "1.5rem", color: "var(--gold)", fontWeight: 500 }}
              >
                — Brian
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
