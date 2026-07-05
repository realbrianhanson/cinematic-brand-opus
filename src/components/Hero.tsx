import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, Mic } from "lucide-react";

import MagneticButton from "./MagneticButton";
import SpringText from "./SpringText";
import DrawLine from "./DrawLine";
import brianHeadshot from "@/assets/brian-headshot.jpeg";

const headlineLines = [
  { text: "A.I. Doesn't", gold: false, italic: false, spring: false, springDelay: 0 },
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const visible = loaded;

  // Lazy-load hero video: only kick in after the page's initial load event.
  useEffect(() => {
    const start = () => {
      const v = videoRef.current;
      if (!v) return;
      if (!v.src) {
        v.src = "/videos/hero-bg.mp4";
        v.load();
        v.play().catch(() => {});
      }
      setVideoReady(true);
    };
    if (document.readyState === "complete") {
      // Delay slightly so it never fights first paint.
      const t = window.setTimeout(start, 400);
      return () => window.clearTimeout(t);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

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
      {/* BG Layer 1: Video (lazy) with poster */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="/og-default.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: videoReady ? 0 : 0.55, transition: "opacity 0.6s ease" }}
        />
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster="/og-default.png"
          className="absolute w-full h-full object-cover"
          style={{ opacity: videoReady ? 0.55 : 0, transition: "opacity 0.8s ease" }}
        />
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, rgba(7,7,14,0.45) 0%, rgba(7,7,14,0.78) 100%)",
        }} />
      </div>

      {/* Headshot on right side (desktop absolute; mobile behind text) */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 pointer-events-none z-[1]"
        style={{
          width: "min(52%, 780px)",
        }}
      >
        <div className="relative w-full h-full">
          <img
            src={brianHeadshot}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 w-full h-full object-cover object-top hidden md:block"
            style={{
              filter: "grayscale(0.35) contrast(1.05) brightness(0.95)",
              maskImage:
                "linear-gradient(90deg, transparent 0%, black 22%, black 100%)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0%, black 22%, black 100%)",
              opacity: visible ? 0.85 : 0,
              transition: "opacity 1.2s ease 0.4s",
            }}
          />
          {/* Mobile: subtle backdrop behind headline */}
          <img
            src={brianHeadshot}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top md:hidden"
            style={{
              filter: "grayscale(0.5) contrast(1.05) brightness(0.75)",
              opacity: visible ? 0.28 : 0,
              transition: "opacity 1s ease 0.3s",
            }}
          />
          {/* Gold tint overlay */}
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background:
                "radial-gradient(ellipse at 70% 40%, rgba(212,175,85,0.14), transparent 60%)",
              mixBlendMode: "screen",
            }}
          />
          {/* Left-side dark gradient to protect text on desktop */}
          <div
            className="absolute inset-0 hidden md:block"
            style={{
              background:
                "linear-gradient(90deg, rgba(7,7,14,1) 0%, rgba(7,7,14,0.85) 30%, rgba(7,7,14,0.25) 60%, transparent 100%)",
            }}
          />
          {/* Mobile: full dark gradient */}
          <div
            className="absolute inset-0 md:hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(7,7,14,0.65) 0%, rgba(7,7,14,0.92) 100%)",
            }}
          />
        </div>
      </div>

      {/* BG Layer 3: Radial accent */}
      <div className="absolute inset-0 pointer-events-none z-[2]" style={{
        background: "radial-gradient(ellipse 50% 40% at 15% 75%, rgba(212,175,85,0.05), transparent)",
      }} />

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
            fontSize: 12, letterSpacing: "0.25em", color: "#D4AF55",
          }}>
            4× Inc. 5000 · AI Educator · Keynote Speaker
          </span>
        </div>

        {/* Headline */}
        <div style={{ maxWidth: 1000 }}>
          {headlineLines.map((line, i) => (
            <div key={i} style={{ overflow: line.spring ? "visible" : "hidden", paddingTop: "0.1em" }}>
              <div
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(115%)",
                  transition: `all 0.8s cubic-bezier(0.22,1,0.36,1) ${0.35 + i * 0.08}s`,
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
            maxWidth: 560,
            fontSize: "1.15rem",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.85)",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 0.7s",
          }}
        >
          Multi-million dollar companies built. 4× Inc. 5000 earned. Now helping 150,000+ business owners use AI to scale. No coding required.
        </p>

        {/* CTA Buttons */}
        <div
          className="flex flex-wrap gap-4 mt-12"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 0.85s",
          }}
        >
          <MagneticButton
            href="https://aiforbeginners.com"
            target="_blank"
            className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase transition-transform duration-200 hover:-translate-y-0.5"
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
            className="inline-flex items-center gap-2 font-body font-bold uppercase transition-all duration-200 hover:-translate-y-0.5 hover:bg-[rgba(212,175,85,0.08)]"
            style={{
              fontSize: 13,
              letterSpacing: "0.08em",
              border: "1.5px solid #D4AF55",
              color: "#ffffff",
              padding: "18.5px 38.5px",
              background: "transparent",
            }}
          >
            <Mic size={15} strokeWidth={2.5} color="#D4AF55" />
            Book Brian to Speak
          </MagneticButton>
        </div>

        {/* Social proof strip */}
        <div
          className="flex items-center gap-4 mt-16"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 1s",
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
          <span className="font-body" style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
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
            border: "1.5px solid rgba(255,255,255,0.25)",
          }}
        >
          <div
            className="absolute rounded-full hero-scroll-dot"
            style={{
              width: 2,
              height: 6,
              background: "rgba(255,255,255,0.7)",
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
