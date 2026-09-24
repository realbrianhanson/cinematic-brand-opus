import { ArrowUpRight, Check } from "lucide-react";
import { summitHref } from "@/lib/summitLink";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function EventCTA() {
  const { event } = useSiteConfig();
  return (
    <section
      id="event"
      className="relative overflow-hidden border-y border-white/10 bg-[#111116] py-20 lg:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(var(--brand-accent-rgb),.09),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-[1440px] gap-12 px-6 lg:grid-cols-[1fr_1fr] lg:gap-24 lg:px-14">
        <div className="self-start lg:sticky lg:top-28">
          <p className="mb-6 flex items-center gap-3 font-body text-xs font-semibold uppercase tracking-[.16em] text-[var(--brand-accent)]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-current"
              aria-hidden="true"
            />
            {event.overline}
          </p>
          <h2
            className="max-w-xl font-display text-white"
            style={{
              fontSize: "clamp(2.6rem, 4.8vw, 4.4rem)",
              lineHeight: 1.05,
            }}
          >
            <em className="block text-[var(--brand-accent)]">
              {event.headingAccent}
            </em>
            {event.headingRest}
          </h2>
          <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-white/75 lg:text-lg">
            {event.intro}
          </p>
          {event.imageSrc && (
            <img
              src={event.imageSrc}
              alt={event.imageAlt}
              loading="lazy"
              width={960}
              height={640}
              className="mt-7 aspect-[3/2] w-full object-cover"
            />
          )}
          {event.cta && (
            <a
              href={summitHref(event.cta.href, "event")}
              data-conversion-destination="summit"
              data-conversion-placement="event"
              target={event.cta.external ? "_blank" : undefined}
              rel={event.cta.external ? "noopener noreferrer" : undefined}
              className="group mt-8 inline-flex min-h-14 w-full items-center justify-center gap-4 bg-[var(--brand-accent)] px-6 py-4 font-body text-sm font-bold text-[var(--brand-backdrop)] hover:bg-[var(--brand-accent-light)] sm:w-auto"
            >
              {event.cta.label}
              <ArrowUpRight
                size={19}
                aria-hidden="true"
                className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </a>
          )}
          {event.ctaNote && (
            <p className="mt-4 max-w-md font-body text-xs leading-relaxed text-white/60">
              {event.ctaNote}
            </p>
          )}
        </div>
        <ol className="divide-y divide-white/15 border-y border-white/15">
          {event.days.map((day, index) => (
            <li
              key={day.day}
              className="grid grid-cols-[auto_1fr] gap-5 py-7 lg:gap-7 lg:py-8"
            >
              <span
                aria-hidden="true"
                className="font-display text-4xl italic text-[var(--brand-accent)]/50"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="mb-2 font-body text-xs font-semibold uppercase tracking-[.15em] text-[var(--brand-accent)]">
                  {day.day}
                </p>
                <h3 className="mb-4 font-display text-2xl text-white md:text-3xl">
                  {day.title}
                </h3>
                <ul className="space-y-2.5">
                  {day.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex gap-3 font-body text-sm leading-relaxed text-white/75"
                    >
                      <Check
                        size={15}
                        className="mt-1 shrink-0 text-[var(--brand-accent)]"
                        aria-hidden="true"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
