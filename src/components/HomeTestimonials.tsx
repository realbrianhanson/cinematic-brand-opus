import { useSiteConfig } from "@/config/SiteConfigContext";

export default function HomeTestimonials() {
  const { homepageTestimonials } = useSiteConfig();
  if (!homepageTestimonials?.items.length) return null;
  const [lead, ...rest] = homepageTestimonials.items;
  return (
    <section
      id="testimonials"
      aria-label={homepageTestimonials.heading}
      className="bg-[var(--brand-backdrop)] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <header className="mb-12 grid gap-6 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
              {homepageTestimonials.overline}
            </p>
            <h2 className="font-display text-4xl leading-[1.12] text-white lg:text-5xl">
              {homepageTestimonials.heading}
            </h2>
          </div>
          {homepageTestimonials.intro && (
            <p className="self-end font-body text-base leading-relaxed text-white/65 lg:max-w-md">
              {homepageTestimonials.intro}
            </p>
          )}
        </header>
        <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <figure className="m-0 flex flex-col justify-between border-l-2 border-[var(--brand-accent)] bg-[linear-gradient(135deg,rgba(var(--brand-accent-rgb),.08),transparent)] p-7 lg:p-10">
            <div>
              <span
                aria-hidden="true"
                className="font-display text-7xl leading-none text-[var(--brand-accent)]"
              >
                “
              </span>
              <blockquote className="font-display text-2xl leading-snug text-white md:text-3xl lg:text-4xl">
                <p>{lead.quote}</p>
              </blockquote>
            </div>
            <figcaption className="mt-8 font-body">
              <span className="block text-sm font-semibold text-white">
                {lead.attribution}
              </span>
              {lead.context && (
                <span className="mt-1 block text-xs text-white/60">
                  {lead.context}
                </span>
              )}
            </figcaption>
          </figure>
          <div className="divide-y divide-white/15">
            {rest.slice(0, 2).map((item) => (
              <figure
                key={`${item.attribution}-${item.quote}`}
                className="m-0 py-6 first:pt-0 last:pb-0"
              >
                <blockquote className="font-body text-base leading-relaxed text-white/80">
                  <p>“{item.quote}”</p>
                </blockquote>
                <figcaption className="mt-5 font-body text-sm">
                  <span className="font-semibold text-white">
                    {item.attribution}
                  </span>
                  {item.context && (
                    <span className="mt-1 block text-xs text-white/55">
                      {item.context}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        {rest.length > 2 && (
          <details className="group mt-10 border-t border-white/15 pt-5">
            <summary className="w-fit cursor-pointer font-body text-sm font-semibold text-[var(--brand-accent)] marker:text-[var(--brand-accent)]">
              More from the community
            </summary>
            <div className="mt-7 grid gap-8 md:grid-cols-3">
              {rest.slice(2).map((item) => (
                <figure
                  key={`${item.attribution}-${item.quote}`}
                  className="m-0"
                >
                  <blockquote className="font-body text-sm leading-relaxed text-white/75">
                    <p>“{item.quote}”</p>
                  </blockquote>
                  <figcaption className="mt-4 font-body text-sm font-semibold text-white">
                    {item.attribution}
                    {item.context && (
                      <span className="mt-1 block text-xs font-normal text-white/55">
                        {item.context}
                      </span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
