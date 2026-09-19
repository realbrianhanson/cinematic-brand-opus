import { useState } from "react";
import { ArrowRight, Play, X } from "lucide-react";
import MagneticButton from "./MagneticButton";
import SpeakingInquiry from "./SpeakingInquiry";
import { useMediaPreferences } from "@/hooks/useMediaPreferences";
import { useReveal, revealStyle } from "@/hooks/useReveal";
import { useSiteConfig } from "@/config/SiteConfigContext";

const TopicCard = ({
  topic,
  index,
}: {
  topic: { title: string; desc: string };
  index: number;
}) => {
  const { ref, visible } = useReveal();
  const { reducedMotion } = useMediaPreferences();

  return (
    <div
      ref={ref}
      className="border-l-2 border-[var(--brand-accent)]/30 bg-white/[0.025] px-5 py-4"
      style={reducedMotion ? undefined : revealStyle(visible, index * 0.05)}
    >
      <h3
        className="font-display text-foreground"
        style={{ fontSize: "1.25rem" }}
      >
        {topic.title}
      </h3>
      <p
        className="font-body mt-2"
        style={{
          fontSize: "1rem",
          lineHeight: 1.7,
          color: "rgba(255,255,255,0.85)",
        }}
      >
        {topic.desc}
      </p>
    </div>
  );
};

const Speaking = () => {
  const siteConfig = useSiteConfig();
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: rightRef, visible: rightVisible } = useReveal();
  const speaking = siteConfig.speaking;
  const [showFootage, setShowFootage] = useState(false);
  const emailBooking = /^mailto:/i.test(speaking.bookingCta?.href || "");
  const hasVisual = Boolean(
    speaking.portraitSrc || speaking.testimonial || siteConfig.hero.videoSrc,
  );

  return (
    <section
      id="speaking"
      className="relative py-20 lg:py-24"
      style={{ background: "#0A0B12" }}
    >
      <div
        className="relative mx-auto px-6 lg:px-14"
        style={{ maxWidth: 1440 }}
      >
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left */}
          <div className={hasVisual ? "lg:col-span-7" : "lg:col-span-12"}>
            <div ref={headerRef}>
              <div
                className="flex items-center gap-4 mb-6"
                style={revealStyle(headerVisible, 0)}
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
                    letterSpacing: "0.3em",
                    color: "var(--brand-accent)",
                  }}
                >
                  {speaking.overline}
                </span>
              </div>

              <h2
                className="font-display mb-5"
                style={{
                  fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)",
                  lineHeight: 1.08,
                  color: "#fff",
                  ...revealStyle(headerVisible, 0.1),
                }}
              >
                {speaking.headingLead}{" "}
                <em
                  style={{
                    fontStyle: "italic",
                    background:
                      "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {speaking.headingAccent}
                </em>
              </h2>

              <p
                className="font-body mb-7"
                style={{
                  fontSize: "1.1rem",
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.85)",
                  maxWidth: 540,
                  ...revealStyle(headerVisible, 0.2),
                }}
              >
                {speaking.intro}
              </p>
            </div>

            <div className="space-y-4">
              {speaking.topics.map((t, i) => (
                <TopicCard key={i} topic={t} index={i} />
              ))}
            </div>

            {speaking.bookingCta && !emailBooking && (
              <div className="mt-10">
                <MagneticButton
                  href={speaking.bookingCta.href}
                  target={speaking.bookingCta.external ? "_blank" : undefined}
                  className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase"
                  style={{
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    background:
                      "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark))",
                    color: "var(--brand-backdrop)",
                    padding: "18px 36px",
                  }}
                >
                  {speaking.bookingCta.label}
                  <ArrowRight size={15} strokeWidth={2.5} />
                  <div className="hero-cta-shine" />
                </MagneticButton>
              </div>
            )}
          </div>

          {/* Right */}
          {hasVisual && (
            <div
              ref={rightRef}
              className="lg:col-span-5"
              style={revealStyle(rightVisible, 0.2)}
            >
              <div className="relative w-full">
                {/* Portrait */}
                {speaking.portraitSrc && (
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      aspectRatio: "4/5",
                      maxHeight: 540,
                    }}
                  >
                    <img
                      src={speaking.portraitSrc}
                      alt={speaking.portraitAlt}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-0 right-0">
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          width: 16,
                          height: 2,
                          background: "var(--brand-accent)",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          width: 2,
                          height: 16,
                          background: "var(--brand-accent)",
                        }}
                      />
                    </div>
                    <div className="absolute bottom-0 left-0">
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          width: 16,
                          height: 2,
                          background: "rgba(var(--brand-accent-rgb),0.3)",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          width: 2,
                          height: 16,
                          background: "rgba(var(--brand-accent-rgb),0.3)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {siteConfig.hero.videoSrc && (
                  <div className="mt-5">
                    <button
                      type="button"
                      aria-expanded={showFootage}
                      aria-controls="speaking-event-footage"
                      onClick={() => setShowFootage((show) => !show)}
                      className="inline-flex items-center gap-2 border border-white/25 px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
                    >
                      {showFootage ? (
                        <X size={17} aria-hidden="true" />
                      ) : (
                        <Play size={17} aria-hidden="true" />
                      )}
                      {showFootage
                        ? "Close event footage"
                        : "Watch event footage"}
                    </button>
                    <div
                      id="speaking-event-footage"
                      hidden={!showFootage}
                      className="mt-4"
                    >
                      {showFootage && (
                        <video
                          src={siteConfig.hero.videoSrc}
                          poster={siteConfig.hero.posterSrc || undefined}
                          controls
                          playsInline
                          preload="metadata"
                          aria-label="Event footage"
                          className="aspect-video w-full bg-black"
                        >
                          Your browser does not support this video.{" "}
                          <a href={siteConfig.hero.videoSrc}>
                            Open event footage
                          </a>
                          .
                        </video>
                      )}
                      <p className="mt-2 text-sm leading-relaxed text-white/75">
                        Footage from the homepage video. Use the player controls
                        to watch.
                      </p>
                    </div>
                  </div>
                )}

                {/* Testimonial card */}
                {speaking.testimonial && (
                  <div
                    className="relative mt-6 p-6"
                    style={{
                      maxWidth: "100%",
                      background: "rgba(10,10,18,0.95)",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      border: "1px solid rgba(var(--brand-accent-rgb),0.2)",
                    }}
                  >
                    <p
                      className="font-display italic"
                      style={{
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: "rgba(255,255,255,0.92)",
                      }}
                    >
                      "{speaking.testimonial.quote}"
                    </p>
                    <span
                      className="font-body block mt-3"
                      style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                    >
                      {speaking.testimonial.attribution}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {speaking.bookingCta && emailBooking && (
          <div className="mt-10 max-w-3xl">
            <SpeakingInquiry href={speaking.bookingCta.href} />
          </div>
        )}
      </div>
    </section>
  );
};

export default Speaking;
