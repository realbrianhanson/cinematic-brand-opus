import { useEffect, useRef, useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import MagneticButton from "./MagneticButton";
import { useReveal, revealStyle } from "@/hooks/useReveal";
import brianHeadshot from "@/assets/brian-headshot.jpeg";

const topics = [
  {
    title: "AI for Business Leaders",
    desc: "Making AI profitable and actionable for non-technical executives. Walk away knowing exactly what to implement Monday morning.",
  },
  {
    title: "The Unfair Advantage",
    desc: "How to build systems that let you compete against anyone, regardless of size or budget. Technology, psychology, and strategy combined.",
  },
  {
    title: "From Burnout to Breakthrough",
    desc: "The story of losing everything, choosing to rebuild, and using AI as the foundation. Resilience, reinvention, and reclaiming your life.",
  },
];

const TopicCard = ({ topic, index }: { topic: (typeof topics)[0]; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="p-6"
      style={{
        borderLeft: `2px solid ${hovered ? "#D4AF55" : "rgba(212,175,85,0.15)"}`,
        background: hovered ? "rgba(212,175,85,0.02)" : "rgba(255,255,255,0.015)",
        transform: visible
          ? hovered ? "translateX(8px)" : "translateX(0)"
          : "translateY(50px)",
        opacity: visible ? 1 : 0,
        transition: `all 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-hover
    >
      <h4 className="font-display text-foreground" style={{ fontSize: "1.15rem" }}>
        {topic.title}
      </h4>
      <p className="font-body mt-2" style={{ fontSize: "0.88rem", lineHeight: 1.7, color: "rgba(255,255,255,0.4)" }}>
        {topic.desc}
      </p>
    </div>
  );
};

const Speaking = () => {
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: rightRef, visible: rightVisible } = useReveal();

  return (
    <section id="speaking" className="relative py-36 lg:py-44" style={{ background: "#0A0B12" }}>
      <div className="relative mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
        <div className="grid lg:grid-cols-12 gap-16 lg:gap-20">
          {/* Left */}
          <div className="lg:col-span-7">
            <div ref={headerRef}>
              <div className="flex items-center gap-4 mb-6" style={revealStyle(headerVisible, 0)}>
                <div style={{ width: 60, height: 2, background: "linear-gradient(90deg, #D4AF55, #E8C96A)" }} />
                <span className="font-body font-bold uppercase" style={{ fontSize: 10, letterSpacing: "0.3em", color: "#D4AF55" }}>
                  Keynotes & Workshops
                </span>
              </div>

              <h2 className="font-display mb-5" style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)", lineHeight: 1.08, color: "#fff", ...revealStyle(headerVisible, 0.1) }}>
                Bring Brian{" "}
                <em style={{
                  fontStyle: "italic",
                  background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  to Your Stage
                </em>
              </h2>

              <p className="font-body mb-12" style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "rgba(255,255,255,0.45)", maxWidth: 520, ...revealStyle(headerVisible, 0.2) }}>
                On stage, I make complex AI simple. I blend hard-won lessons with humor and deliver frameworks audiences use immediately. No recycled TED talks.
              </p>
            </div>

            <div className="space-y-4">
              {topics.map((t, i) => <TopicCard key={i} topic={t} index={i} />)}
            </div>

            <div className="mt-10">
              <MagneticButton
                href="#contact"
                className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase"
                style={{
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  background: "linear-gradient(135deg, #D4AF55, #B8962E)",
                  color: "#07070E",
                  padding: "18px 36px",
                }}
              >
                Inquire About Booking
                <ArrowRight size={15} strokeWidth={2.5} />
                <div className="hero-cta-shine" />
              </MagneticButton>
            </div>
          </div>

          {/* Right */}
          <div ref={rightRef} className="lg:col-span-5 flex items-center" style={revealStyle(rightVisible, 0.2)}>
            <div className="relative w-full">
              {/* Photo placeholder */}
              <div
                className="relative w-full overflow-hidden"
                style={{
                  aspectRatio: "3/4",
                }}
              >
                <img
                  src={brianHeadshot}
                  alt="Brian Hanson"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-0 right-0">
                  <div style={{ position: "absolute", top: 0, right: 0, width: 16, height: 2, background: "#D4AF55" }} />
                  <div style={{ position: "absolute", top: 0, right: 0, width: 2, height: 16, background: "#D4AF55" }} />
                </div>
                <div className="absolute bottom-0 left-0">
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: 16, height: 2, background: "rgba(212,175,85,0.3)" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: 2, height: 16, background: "rgba(212,175,85,0.3)" }} />
                </div>
              </div>

              {/* Testimonial card */}
              <div
                className="relative lg:absolute lg:-bottom-10 lg:-right-10 mt-6 lg:mt-0 p-6"
                style={{
                  maxWidth: 300,
                  background: "rgba(10,10,18,0.95)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid rgba(212,175,85,0.15)",
                }}
              >
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={12} fill="#D4AF55" color="#D4AF55" />
                  ))}
                </div>
                <p className="font-display italic" style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>
                  "Brian's keynote was the highlight of our entire conference."
                </p>
                <span className="font-body block mt-3" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  — Event Director, Fortune 500 Company
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Speaking;
