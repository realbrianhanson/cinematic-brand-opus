import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowDown, Pause, Play, Users } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { useMediaPreferences } from "@/hooks/useMediaPreferences";

interface HeroProps {
  loaded?: boolean;
}

export default function Hero({ loaded: _loaded = true }: HeroProps) {
  const { hero, identity } = useSiteConfig();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const { lightMode, resolved } = useMediaPreferences();

  // Keep the poster visible until the original video really starts playing.
  useEffect(() => {
    if (!hero.videoSrc || lightMode || !resolved) return;
    const start = () => {
      const video = videoRef.current;
      if (!video || video.getAttribute("src")) return;
      video.src = hero.videoSrc!;
      video.load();
      video.play().catch(() => setVideoReady(false));
    };
    if (document.readyState === "complete") {
      const timer = window.setTimeout(start, 400);
      return () => window.clearTimeout(timer);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [hero.videoSrc, lightMode, resolved]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setPaused(true));
    else video.pause();
  };

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[min(900px,100svh)] items-center overflow-hidden bg-[var(--site-surface,var(--brand-backdrop))]"
    >
      <div
        className="hero-background-media absolute inset-0 -z-20"
        aria-hidden="true"
      >
        {hero.posterSrc && (
          <img
            src={hero.posterSrc}
            alt=""
            fetchPriority="high"
            className="absolute h-full w-full object-cover object-[65%_center]"
            style={{ opacity: videoReady ? 0 : 0.6 }}
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
            onPlaying={() => {
              setVideoReady(true);
              setPaused(false);
            }}
            onPause={() => setPaused(true)}
            onError={() => setVideoReady(false)}
            className="absolute h-full w-full object-cover object-[65%_center] transition-opacity duration-700"
            style={{ opacity: videoReady ? 1 : 0 }}
          />
        )}
      </div>
      <div
        aria-hidden="true"
        className="hero-background-scrim absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(var(--brand-backdrop-rgb),.96)_0%,rgba(var(--brand-backdrop-rgb),.83)_40%,rgba(var(--brand-backdrop-rgb),.2)_100%)] max-md:bg-[linear-gradient(90deg,rgba(var(--brand-backdrop-rgb),.92),rgba(var(--brand-backdrop-rgb),.7))]"
      />
      <div
        aria-hidden="true"
        className="hero-background-fade absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-t from-[var(--brand-backdrop)] to-transparent"
      />
      <div className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-36 lg:px-14 lg:pb-32 lg:pt-44">
        {hero.overline && (
          <p className="mb-7 flex items-center gap-3 font-body text-xs font-semibold uppercase tracking-[.17em] text-[var(--brand-accent)]">
            <span className="h-px w-9 bg-current" aria-hidden="true" />
            {hero.overline}
          </p>
        )}
        <h1
          aria-label={hero.headlineLines.map((line) => line.text).join(" ")}
          className="max-w-[1000px] font-display text-white"
          style={{
            fontSize: "clamp(3.15rem, 7.8vw, 7rem)",
            lineHeight: 0.99,
            letterSpacing: "-.035em",
          }}
        >
          {hero.headlineLines.map((line, index) => (
            <span
              key={index}
              className={`block ${line.italic ? "italic" : ""} ${line.gold ? "text-[var(--brand-accent)]" : ""}`}
            >
              {line.text}
              {index < hero.headlineLines.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>
        <p className="mt-7 max-w-[540px] font-body text-base leading-relaxed text-white/85 md:text-lg">
          {hero.subtitle}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {hero.primaryCta && (
            <a
              href={hero.primaryCta.href}
              data-conversion-destination="summit"
              data-conversion-placement="hero"
              target={hero.primaryCta.external ? "_blank" : undefined}
              rel={hero.primaryCta.external ? "noopener noreferrer" : undefined}
              className="group inline-flex min-h-14 items-center justify-center gap-4 bg-[var(--brand-accent)] px-7 py-4 font-body text-sm font-bold text-[var(--brand-backdrop)] transition-colors hover:bg-[var(--brand-accent-light)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
            >
              {hero.primaryCta.label}
              <ArrowRight
                size={19}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              />
            </a>
          )}
          {hero.secondaryCta && (
            <a
              href={hero.secondaryCta.href}
              target={hero.secondaryCta.external ? "_blank" : undefined}
              rel={
                hero.secondaryCta.external ? "noopener noreferrer" : undefined
              }
              className="inline-flex min-h-14 items-center justify-center gap-3 border border-white/30 bg-black/15 px-7 py-4 font-body text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {hero.secondaryCta.label}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          )}
        </div>
        {hero.socialProof && (
          <p className="mt-7 flex items-center gap-2.5 font-body text-sm text-white/75">
            <Users
              size={18}
              className="shrink-0 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
            {hero.socialProof}
          </p>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-6 lg:px-14">
        <p className="font-body text-xs tracking-wide text-white/60">
          {identity.name}
          <span className="mx-3 text-[var(--brand-accent)]" aria-hidden="true">
            /
          </span>
          {identity.tagline}
        </p>
        {videoReady && !lightMode ? (
          <button
            type="button"
            onClick={togglePlayback}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/25 bg-black/20 px-3 text-xs text-white hover:bg-black/50"
            aria-label={
              paused ? "Resume background video" : "Pause background video"
            }
          >
            {paused ? (
              <Play size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {paused ? "Play" : "Pause"}
            </span>
          </button>
        ) : (
          <ArrowDown
            className="shrink-0 text-white/40"
            size={20}
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}
