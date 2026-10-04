import { useSiteConfig } from "@/config/SiteConfigContext";
import { summitHref } from "@/lib/summitLink";

/** Keep broader training available without repeating the entire agenda on home. */
export default function HomeSummit() {
  const { event } = useSiteConfig();
  if (!event.cta) return null;
  return (
    <section
      id="event"
      aria-labelledby="home-summit-heading"
      className="mx-auto max-w-[1440px] px-6 py-12 lg:px-14"
    >
      <div className="flex flex-col gap-6 border-y border-white/15 py-10 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2
            id="home-summit-heading"
            className="font-display text-3xl text-white sm:text-4xl"
          >
            Explore more at the free AI for Business Summit
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Three days of practical demonstrations for marketing, sales, and
            everyday business work. See the registration page for dates and
            session times.
          </p>
        </div>
        <a
          href={summitHref(event.cta.href, "event")}
          data-conversion-destination="summit"
          data-conversion-placement="event"
          className="shrink-0 self-start border-b border-[var(--brand-accent)] pb-2 text-sm font-semibold text-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Explore the Free Summit
        </a>
      </div>
    </section>
  );
}
