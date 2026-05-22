import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import MagneticButton from "./MagneticButton";
import brianPortrait from "@/assets/brian-headshot.jpeg";

const headlineWords = ["The", "Visionaries", "Finally", "Have", "the", "Tools."];

interface HeroProps {
  loaded?: boolean;
}

const Hero = ({ loaded = true }: HeroProps) => {
  const portraitRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 1024) return;

    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (portraitRef.current) {
        portraitRef.current.style.transform = `translate3d(${x * -10}px, ${y * -8}px, 0)`;
      }
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${x * 18}px, ${y * 14}px, 0)`;
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden bg-deep"
    >
      {/* Warm gold glow top-right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 90% 10%, rgba(241,216,155,0.18), transparent 60%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(156,124,60,0.08), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 1440 }}>
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* LEFT — copy */}
          <div className="lg:col-span-7">
            {/* Eyebrow */}
            <div className="flex items-center gap-4 mb-8">
              <div style={{ width: 60, height: 2, background: "var(--gold-gradient)" }} />
              <span
                className="font-body font-semibold uppercase"
                style={{ fontSize: 11, letterSpacing: "0.22em", color: "var(--gold)" }}
              >
                4× Inc. 5000 · A.I. Educator · Keynote Speaker
              </span>
            </div>

            {/* Headline */}
            <h1
              className="font-display"
              style={{
                fontSize: "clamp(2.75rem, 7.5vw, 6.5rem)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                color: "var(--warm-white)",
                fontWeight: 500,
              }}
            >
              {headlineWords.map((w, i) => {
                const isGold = w === "Visionaries";
                return (
                  <span key={i} className="word-rise-wrap">
                    <span
                      className={`word-rise ${isGold ? "gold-italic" : ""}`}
                      style={{
                        animationDelay: `${i * 70}ms`,
                        fontWeight: isGold ? 600 : 500,
                      }}
                    >
                      {w}
                    </span>
                    {i < headlineWords.length - 1 && <span>&nbsp;</span>}
                  </span>
                );
              })}
            </h1>

            {/* Subhead */}
            <p
              className="mt-8 max-w-xl"
              style={{
                fontSize: "1.125rem",
                lineHeight: 1.7,
                color: "var(--warm-body)",
                animation: "wordRise 600ms ease-out 600ms both",
              }}
            >
              Multi-million dollar companies built. 4× Inc. 5000 earned. Now I help 150,000+
              business owners use A.I. to scale, with no coding and no tech background required.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-wrap items-center gap-6 mt-10"
              style={{ animation: "wordRise 600ms ease-out 750ms both" }}
            >
              <MagneticButton
                href="https://aiforbeginners.com"
                target="_blank"
                className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase rounded-sm transition-shadow"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  background: "linear-gradient(135deg, #f1d89b, #d8b46a 60%, #9c7c3c)",
                  color: "#0b0a09",
                  padding: "20px 36px",
                  boxShadow: "0 18px 48px -18px rgba(216,180,106,0.55)",
                }}
              >
                <Sparkles size={15} strokeWidth={2.5} />
                Join the Free 3-Day Event
                <ArrowRight size={15} strokeWidth={2.5} />
              </MagneticButton>

              <a
                href="#speaking"
                data-hover
                className="nav-link-underline font-body font-semibold uppercase"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  color: "var(--warm-body)",
                  paddingBottom: 4,
                }}
              >
                Book Brian to Speak
              </a>
            </div>

            {/* Trust chip */}
            <div
              className="flex items-center gap-4 mt-12"
              style={{ animation: "wordRise 600ms ease-out 900ms both" }}
            >
              <div className="flex -space-x-2">
                {[
                  "linear-gradient(135deg, #d8b46a, #9c7c3c)",
                  "linear-gradient(135deg, #f1d89b, #d8b46a)",
                  "linear-gradient(135deg, #9c7c3c, #5b4422)",
                  "linear-gradient(135deg, #d8b46a, #f1d89b)",
                  "linear-gradient(135deg, #b7913f, #d8b46a)",
                ].map((bg, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 30,
                      height: 30,
                      background: bg,
                      border: "2px solid var(--bg-deep)",
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 13, color: "var(--warm-body)" }}>
                Join 150,000+ business owners already building
              </span>
            </div>
          </div>

          {/* RIGHT — portrait */}
          <div className="lg:col-span-5 relative flex justify-center lg:justify-end">
            <div
              ref={portraitRef}
              className="relative"
              style={{
                width: "min(440px, 100%)",
                aspectRatio: "3/4",
                transition: "transform 250ms ease-out",
                willChange: "transform",
              }}
            >
              {/* Glow */}
              <div
                ref={glowRef}
                className="absolute pointer-events-none"
                style={{
                  inset: "-40px",
                  background:
                    "radial-gradient(ellipse at 50% 30%, rgba(241,216,155,0.28), transparent 65%)",
                  filter: "blur(20px)",
                  transition: "transform 300ms ease-out",
                }}
              />
              {/* Frame */}
              <div
                className="relative w-full h-full overflow-hidden"
                style={{
                  background: "var(--bg-warm)",
                  border: "1px solid var(--hairline)",
                }}
              >
                <img
                  src={brianPortrait}
                  alt="Brian Hanson on stage"
                  className="w-full h-full object-cover"
                  style={{ filter: "saturate(1.05) contrast(1.05)" }}
                />
                {/* Warm spotlight inside */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse 60% 40% at 50% 25%, rgba(241,216,155,0.22), transparent 60%), linear-gradient(180deg, transparent 50%, rgba(9,9,11,0.65) 100%)",
                  }}
                />
              </div>
              {/* Gold corner brackets */}
              {[
                { top: -1, left: -1, borders: "top left" },
                { top: -1, right: -1, borders: "top right" },
                { bottom: -1, left: -1, borders: "bottom left" },
                { bottom: -1, right: -1, borders: "bottom right" },
              ].map((c, i) => {
                const [v, h] = c.borders.split(" ");
                return (
                  <div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{
                      width: 28,
                      height: 28,
                      top: (c as any).top,
                      left: (c as any).left,
                      right: (c as any).right,
                      bottom: (c as any).bottom,
                      borderTop: v === "top" ? "1.5px solid var(--gold)" : undefined,
                      borderBottom: v === "bottom" ? "1.5px solid var(--gold)" : undefined,
                      borderLeft: h === "left" ? "1.5px solid var(--gold)" : undefined,
                      borderRight: h === "right" ? "1.5px solid var(--gold)" : undefined,
                    }}
                  />
                );
              })}
              {/* Caption */}
              <div
                className="absolute -bottom-10 left-0 right-0 text-center font-body uppercase"
                style={{ fontSize: 10, letterSpacing: "0.25em", color: "var(--label-muted)" }}
              >
                Brian Hanson · Live, On Stage
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div
        className="absolute bottom-8 left-6 lg:left-14 flex items-center gap-3 font-body uppercase"
        style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--label-muted)" }}
      >
        <span>Scroll</span>
        <div style={{ width: 30, height: 1, background: "var(--gold)" }} />
      </div>
    </section>
  );
};

export default Hero;
