import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, Mic } from "lucide-react";

import MagneticButton from "./MagneticButton";
import SpringText from "./SpringText";
import DrawLine from "./DrawLine";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { useMediaPreferences } from "@/hooks/useMediaPreferences";

interface HeroProps {
  loaded?: boolean;
}

const Hero = ({ loaded = true }: HeroProps) => {
  const siteConfig = useSiteConfig();
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const { lightMode, resolved } = useMediaPreferences();
  const visible = loaded;
  const { hero, brand } = siteConfig;
  const { headlineLines } = hero;
  const headlineText = headlineLines.map((l) => l.text).join(" ");

  // Lazy-load the decorative hero video after first paint. Skipped entirely for
  // reduced-motion or data-saver visitors; the poster image carries the design.
  useEffect(() => {
    if (!hero.videoSrc || lightMode || !resolved) return;
    const start = () => {
      const v = videoRef.current;
      if (!v) return;
      if (!v.src) {
        v.src = hero.videoSrc!;
        v.load();
        // videoReady flips on the `playing` event, so the poster stays put if
        // playback never actually starts.
        v.play().catch(() => setVideoReady(false));
      }
    };
    if (document.readyState === "complete") {
      const t = window.setTimeout(start, 400);
      return () => window.clearTimeout(t);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [hero.videoSrc, lightMode, resolved]);

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
        {hero.posterSrc && (
          <img
            src={hero.posterSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: videoReady ? 0 : 0.55,
              transition: "opacity 0.6s ease",
            }}
          />
        )}
        {hero.videoSrc && !lightMode && (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            poster={hero.posterSrc ?? undefined}
            aria-hidden="true"
            onPlaying={() => setVideoReady(true)}
            onError={() => setVideoReady(false)}
            onStalled={() => setVideoReady(false)}
            className="absolute w-full h-full object-cover"
            style={{
              opacity: videoReady ? 1 : 0,
              transition: "opacity 0.8s ease",
            }}
          />
        )}
        {/* Desktop horizontal scrim: heavy left → light right */}
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            background:
              "linear-gradient(90deg, rgba(var(--brand-backdrop-rgb),0.92) 0%, rgba(var(--brand-backdrop-rgb),0.88) 30%, rgba(var(--brand-backdrop-rgb),0.55) 55%, rgba(var(--brand-backdrop-rgb),0.28) 80%, rgba(var(--brand-backdrop-rgb),0.22) 100%)",
          }}
        />
        {/* Desktop bottom scrim for CTA legibility */}
        <div
          className="absolute inset-x-0 bottom-0 hidden md:block"
          style={{
            height: "45%",
            background:
              "linear-gradient(180deg, transparent 0%, rgba(var(--brand-backdrop-rgb),0.55) 100%)",
          }}
        />
        {/* Mobile: stronger uniform scrim */}
        <div
          className="absolute inset-0 md:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(var(--brand-backdrop-rgb),0.82) 0%, rgba(var(--brand-backdrop-rgb),0.85) 100%)",
          }}
        />
      </div>

      {/* BG Layer 3: Radial accent */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 15% 75%, rgba(var(--brand-accent-rgb),0.05), transparent)",
        }}
      />

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
        {hero.overline && (
          <div
            className="flex items-center gap-4 mb-10"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 0.4s",
            }}
          >
            <div
              style={{
                width: 60,
                height: 2,
                background:
                  "linear-gradient(90deg, var(--brand-accent), var(--brand-accent-light))",
              }}
            />
            <span
              className="font-body font-bold uppercase"
              style={{
                fontSize: 12,
                letterSpacing: "0.25em",
                color: "var(--brand-accent)",
              }}
            >
              {hero.overline}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1
          className="font-display leading-none"
          style={{
            maxWidth: 1000,
            fontSize: "clamp(3rem, 8vw, 7.5rem)",
            lineHeight: 0.95,
            margin: 0,
          }}
          aria-label={headlineText}
        >
          {headlineLines.map((line, i) => (
            <span
              key={i}
              style={{
                display: "block",
                overflow: line.spring ? "visible" : "hidden",
                paddingTop: "0.1em",
              }}
            >
              <span
                style={{
                  display: "block",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(115%)",
                  transition: `all 0.8s cubic-bezier(0.22,1,0.36,1) ${0.35 + i * 0.08}s`,
                }}
              >
                <span
                  className={line.italic ? "italic" : ""}
                  style={{
                    display: "block",
                    ...(!line.gold ? { color: "#fff" } : {}),
                  }}
                >
                  {line.spring ? (
                    <SpringText
                      text={line.text}
                      visible={visible}
                      delay={line.springDelay ?? 0}
                      charStyle={
                        line.gold
                          ? {
                              background:
                                "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                            }
                          : undefined
                      }
                    />
                  ) : (
                    line.text
                  )}
                </span>
              </span>
            </span>
          ))}
        </h1>

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
          {hero.subtitle}
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
          {hero.primaryCta && (
            <MagneticButton
              href={hero.primaryCta.href}
              target={hero.primaryCta.external ? "_blank" : undefined}
              className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase transition-transform duration-200 hover:-translate-y-0.5"
              style={{
                fontSize: 13,
                letterSpacing: "0.08em",
                background:
                  "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark))",
                color: "var(--brand-backdrop)",
                padding: "20px 40px",
              }}
            >
              <Sparkles size={15} strokeWidth={2.5} />
              {hero.primaryCta.label}
              <ArrowRight size={15} strokeWidth={2.5} />
              <div className="hero-cta-shine" />
            </MagneticButton>
          )}

          {hero.secondaryCta && (
            <MagneticButton
              href={hero.secondaryCta.href}
              target={hero.secondaryCta.external ? "_blank" : undefined}
              className="inline-flex items-center gap-2 font-body font-bold uppercase transition-all duration-200 hover:-translate-y-0.5 hover:bg-[rgba(var(--brand-accent-rgb),0.08)]"
              style={{
                fontSize: 13,
                letterSpacing: "0.08em",
                border: "1.5px solid var(--brand-accent)",
                color: "#ffffff",
                padding: "18.5px 38.5px",
                background: "transparent",
              }}
            >
              <Mic size={15} strokeWidth={2.5} color={brand.accent} />
              {hero.secondaryCta.label}
            </MagneticButton>
          )}
        </div>

        {/* Social proof strip */}
        {hero.socialProof && (
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
                "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark))",
                "linear-gradient(135deg, var(--brand-accent-light), var(--brand-accent))",
                "linear-gradient(135deg, var(--brand-accent-dark), #8B7023)",
                "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                "linear-gradient(135deg, #8B7023, var(--brand-accent))",
              ].map((bg, i) => (
                <div
                  key={i}
                  className="rounded-full border-2"
                  style={{
                    width: 34,
                    height: 34,
                    background: bg,
                    borderColor: "var(--brand-backdrop)",
                  }}
                />
              ))}
            </div>
            <span
              className="font-body"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}
            >
              {hero.socialProof}
            </span>
          </div>
        )}
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
