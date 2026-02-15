import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, Mic } from "lucide-react";
import ParticleGalaxy from "./ParticleGalaxy";
import MagneticButton from "./MagneticButton";
import SpringText from "./SpringText";
import DrawLine from "./DrawLine";

const headlineLines = [
  { text: "AI Doesn't", gold: false, italic: false, spring: false, springDelay: 0 },
  { text: "Replace People.", gold: false, italic: false, spring: false, springDelay: 0 },
  { text: "It Replaces", gold: true, italic: true, spring: true, springDelay: 0.9 },
  { text: "Inefficiency.", gold: true, italic: true, spring: true, springDelay: 1.1 },
];

interface HeroProps {
  loaded?: boolean;
}

const Hero = ({ loaded = true }: HeroProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = loaded;


  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (contentRef.current) {
        const o = Math.max(1 - y / 600, 0);
        contentRef.current.style.opacity = String(o);
        contentRef.current.style.transform = `translateY(${y * 0.25}px)`;
      }
      if (scrollRef.current) {
        scrollRef.current.style.opacity = String(Math.max(1 - y / 200, 0));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden"
    >
      {/* BG Layer 1: Particles */}
      <ParticleGalaxy />

      {/* BG Layer 2: Rotating gradient mesh */}
      <div
        className="absolute inset-0 pointer-events-none hero-rotate"
        style={{
          width: "140%",
          height: "140%",
          top: "-20%",
          left: "-20%",
          background: "conic-gradient(from 0deg, rgba(212,175,85,0.04), rgba(184,150,46,0.03), rgba(232,201,106,0.05), rgba(212,175,85,0.04))",
          opacity: 0.04,
        }}
      />

      {/* BG Layer 3: Radial gradients */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 60% 50% at 70% 25%, rgba(212,175,85,0.06), transparent), radial-gradient(ellipse 50% 40% at 15% 75%, rgba(212,175,85,0.04), transparent)",
      }} />

      {/* BG Layer 4: Film grain */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.35 }}>
        <svg className="w-full h-full">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" opacity="0.5" />
        </svg>
      </div>

      {/* BG Layer 5: Decorative lines */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute" style={{
          width: 1, height: "35%", top: 0, left: "18%",
          background: "linear-gradient(180deg, rgba(212,175,85,0.12), transparent)",
        }} />
        <div className="absolute" style={{
          width: "200%", height: 1, top: "40%", left: "-50%",
          background: "linear-gradient(90deg, transparent, rgba(212,175,85,0.04), transparent)",
          transform: "rotate(-28deg)",
        }} />
        <div className="absolute" style={{
          width: "200%", height: 1, top: "65%", left: "-50%",
          background: "linear-gradient(90deg, transparent, rgba(212,175,85,0.03), transparent)",
          transform: "rotate(18deg)",
        }} />
      </div>

      {/* Corner accent lines */}
      <DrawLine
        visible={visible}
        d="M380,0 L400,0 L400,20"
        className="absolute top-0 right-0 w-[200px] h-[200px] lg:w-[400px] lg:h-[400px] pointer-events-none z-10"
      />
      <DrawLine
        visible={visible}
        d="M0,380 L0,400 L20,400"
        className="absolute bottom-0 left-0 w-[200px] h-[200px] lg:w-[400px] lg:h-[400px] pointer-events-none z-10"
      />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-20 w-full mx-auto px-6 lg:px-14 pt-28 pb-20"
        style={{ maxWidth: 1440 }}
      >
        {/* Overline */}
        <div
          className="flex items-center gap-4 mb-10"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 0.4s",
          }}
        >
          <div style={{
            width: 60, height: 2,
            background: "linear-gradient(90deg, #D4AF55, #E8C96A)",
          }} />
          <span className="font-body font-bold uppercase" style={{
            fontSize: 11, letterSpacing: "0.25em", color: "#D4AF55",
          }}>
            4× Inc. 5000 · AI Educator · Keynote Speaker
          </span>
        </div>

        {/* Headline */}
        <div style={{ maxWidth: 1000 }}>
          {headlineLines.map((line, i) => (
            <div key={i} className={line.spring ? "" : "overflow-hidden"}>
              <div
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(115%)",
                  transition: `all 0.8s cubic-bezier(0.22,1,0.36,1) ${0.55 + i * 0.1}s`,
                }}
              >
                <h1
                  className={`font-display leading-none ${line.italic ? "italic" : ""}`}
                  style={{
                    fontSize: "clamp(3rem, 8vw, 7.5rem)",
                    lineHeight: 0.95,
                    ...(!line.gold ? { color: "#fff" } : {}),
                  }}
                >
                  {line.spring ? (
                    <SpringText
                      text={line.text}
                      visible={visible}
                      delay={line.springDelay}
                      charStyle={line.gold ? {
                        background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      } : undefined}
                    />
                  ) : (
                    line.text
                  )}
                </h1>
              </div>
            </div>
          ))}
        </div>

        {/* Sub-copy */}
        <p
          className="font-body mt-10"
          style={{
            maxWidth: 520,
            fontSize: "1.1rem",
            lineHeight: 1.8,
            color: "rgba(255,255,255,0.4)",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.7s cubic-bezier(0.22,1,0.36,1) 1s",
          }}
        >
          Multi-million dollar companies built. 4× Inc. 5000 earned. Now helping 150,000+ business owners use AI to scale — no coding required.
        </p>

        {/* CTA Buttons */}
        <div
          className="flex flex-wrap gap-4 mt-12"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.7s cubic-bezier(0.22,1,0.36,1) 1.1s",
          }}
        >
          <MagneticButton
            href="https://aiforbeginners.com"
            target="_blank"
            className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase"
            style={{
              fontSize: 13,
              letterSpacing: "0.08em",
              background: "linear-gradient(135deg, #D4AF55, #B8962E)",
              color: "#07070E",
              padding: "20px 40px",
            }}
          >
            <Sparkles size={15} strokeWidth={2.5} />
            Join Free 3-Day AI Event
            <ArrowRight size={15} strokeWidth={2.5} />
            <div className="hero-cta-shine" />
          </MagneticButton>

          <MagneticButton
            href="#speaking"
            className="inline-flex items-center gap-2 font-body font-bold uppercase transition-all duration-300 hover:border-gold/50 hover:bg-gold/5"
            style={{
              fontSize: 13,
              letterSpacing: "0.08em",
              border: "1px solid rgba(212,175,85,0.2)",
              color: "rgba(212,175,85,0.8)",
              padding: "20px 40px",
              background: "transparent",
            }}
          >
            <Mic size={15} strokeWidth={2.5} />
            Book Brian to Speak
          </MagneticButton>
        </div>

        {/* Social proof strip */}
        <div
          className="flex items-center gap-4 mt-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.7s cubic-bezier(0.22,1,0.36,1) 1.3s",
          }}
        >
          <div className="flex -space-x-2">
            {[
              "linear-gradient(135deg, #D4AF55, #B8962E)",
              "linear-gradient(135deg, #E8C96A, #D4AF55)",
              "linear-gradient(135deg, #B8962E, #8B7023)",
              "linear-gradient(135deg, #D4AF55, #E8C96A)",
              "linear-gradient(135deg, #8B7023, #D4AF55)",
            ].map((bg, i) => (
              <div
                key={i}
                className="rounded-full border-2"
                style={{
                  width: 34,
                  height: 34,
                  background: bg,
                  borderColor: "#07070E",
                }}
              />
            ))}
          </div>
          <span className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            150,000+ business owners in the community
          </span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        ref={scrollRef}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{ zIndex: 10 }}
      >
        <div
          className="relative flex justify-center"
          style={{
            width: 16,
            height: 26,
            borderRadius: 9999,
            border: "1.5px solid rgba(255,255,255,0.12)",
          }}
        >
          <div
            className="absolute rounded-full hero-scroll-dot"
            style={{
              width: 2,
              height: 6,
              background: "rgba(255,255,255,0.3)",
              top: 5,
              borderRadius: 9999,
            }}
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
