import { useId } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import type { SiteConfig } from "@/config/types";
import { testimonialCopy } from "@/components/testimonials/copy";
import TestimonialGroupSection from "@/components/testimonials/TestimonialGroupSection";
import TestimonialWall from "@/components/testimonials/TestimonialWall";

type HomepageTestimonials = NonNullable<SiteConfig["homepageTestimonials"]>;
type CommunityItem = HomepageTestimonials["items"][number];

/**
 * Homepage testimonials. A preset with `groups` gets the grouped layout: the
 * groups, the short-lines wall, then `items` in a collapsed list. A preset
 * with only `items` renders exactly as it always has.
 */
export default function HomeTestimonials() {
  const { homepageTestimonials } = useSiteConfig();
  if (!homepageTestimonials) return null;
  if (homepageTestimonials.groups?.some((group) => group.items.length > 0))
    return <GroupedTestimonials testimonials={homepageTestimonials} />;
  if (homepageTestimonials.items.length === 0) return null;
  return <FlatTestimonials testimonials={homepageTestimonials} />;
}

function GroupedTestimonials({
  testimonials,
}: {
  testimonials: HomepageTestimonials;
}) {
  const headingId = useId();
  const { overline, heading, intro, groups = [], wall, items } = testimonials;
  return (
    <section
      id="testimonials"
      aria-labelledby={headingId}
      className="bg-[var(--brand-backdrop)] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <header className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
              {overline}
            </p>
            <h2
              id={headingId}
              className="font-display text-4xl leading-[1.12] text-white lg:text-5xl"
            >
              {heading}
            </h2>
          </div>
          {intro && (
            <p className="self-end text-balance font-body text-base leading-relaxed text-white/70 lg:max-w-md">
              {intro}
            </p>
          )}
        </header>
        <div className="space-y-16 lg:space-y-20">
          {groups.map((group) => (
            <TestimonialGroupSection key={group.id} group={group} />
          ))}
          {wall && wall.items.length > 0 && <TestimonialWall wall={wall} />}
        </div>
        {items.length > 0 && (
          <CommunityQuotes items={items} spacing="mt-16 lg:mt-20" />
        )}
      </div>
    </section>
  );
}

/** The original single-list layout, unchanged for presets without groups. */
function FlatTestimonials({
  testimonials,
}: {
  testimonials: HomepageTestimonials;
}) {
  const [lead, ...rest] = testimonials.items;
  return (
    <section
      id="testimonials"
      aria-label={testimonials.heading}
      className="bg-[var(--brand-backdrop)] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <header className="mb-12 grid gap-6 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
              {testimonials.overline}
            </p>
            <h2 className="font-display text-4xl leading-[1.12] text-white lg:text-5xl">
              {testimonials.heading}
            </h2>
          </div>
          {testimonials.intro && (
            <p className="self-end font-body text-base leading-relaxed text-white/65 lg:max-w-md">
              {testimonials.intro}
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
          <CommunityQuotes items={rest.slice(2)} spacing="mt-10" />
        )}
      </div>
    </section>
  );
}

/** Additional quotes in an accessible, collapsed disclosure. */
function CommunityQuotes({
  items,
  spacing,
}: {
  items: CommunityItem[];
  spacing: string;
}) {
  return (
    <details className={`group ${spacing} border-t border-white/15 pt-5`}>
      <summary className="w-fit cursor-pointer font-body text-sm font-semibold text-[var(--brand-accent)] marker:text-[var(--brand-accent)]">
        {testimonialCopy.moreFromCommunity}
      </summary>
      <div className="mt-7 grid gap-8 md:grid-cols-3">
        {items.map((item) => (
          <figure key={`${item.attribution}-${item.quote}`} className="m-0">
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
  );
}
