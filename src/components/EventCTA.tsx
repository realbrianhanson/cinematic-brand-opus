import { ArrowUpRight, Check } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import HomeSectionHeading from "./HomeSectionHeading";

export default function EventCTA() {
  const { event } = useSiteConfig();
  return (
    <section
      id="event"
      className="py-16 lg:py-24"
      style={{ background: "#0A0B12" }}
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <div
          className={`grid gap-8 lg:gap-14 items-center mb-10 ${event.imageSrc ? "lg:grid-cols-2" : ""}`}
        >
          <div>
            <HomeSectionHeading overline={event.overline} intro={event.intro}>
              <em style={{ color: "var(--brand-accent)" }}>
                {event.headingAccent}
              </em>{" "}
              {event.headingRest}
            </HomeSectionHeading>
            {event.cta && (
              <a
                href={event.cta.href}
                target={event.cta.external ? "_blank" : undefined}
                rel={event.cta.external ? "noopener noreferrer" : undefined}
                className="inline-flex items-center justify-center gap-3 px-6 py-4 font-body font-bold text-sm hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-backdrop)",
                }}
              >
                {event.cta.label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            )}
            {event.ctaNote && (
              <p className="font-body text-sm leading-relaxed text-white/70 mt-4 max-w-md">
                {event.ctaNote}
              </p>
            )}
          </div>
          {event.imageSrc && (
            <img
              src={event.imageSrc}
              alt={event.imageAlt}
              loading="lazy"
              width={960}
              height={640}
              className="w-full aspect-[3/2] object-cover border border-white/10"
            />
          )}
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {event.days.map((day) => (
            <article
              key={day.day}
              className="p-6 lg:p-7 border border-white/15 bg-white/[0.02]"
            >
              <p
                className="font-body text-xs uppercase tracking-widest font-bold mb-3"
                style={{ color: "var(--brand-accent)" }}
              >
                {day.day}
              </p>
              <h3 className="font-display text-2xl text-white mb-5">
                {day.title}
              </h3>
              <ul className="space-y-3">
                {day.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 font-body text-sm lg:text-base leading-relaxed text-white/80"
                  >
                    <Check
                      size={16}
                      className="shrink-0 mt-1"
                      aria-hidden="true"
                      style={{ color: "var(--brand-accent)" }}
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
