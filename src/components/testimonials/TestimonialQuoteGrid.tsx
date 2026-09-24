import { useId } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import type { TestimonialQuoteGridConfig } from "@/config/types";
import { cn } from "@/lib/utils";
import { quoteGridLayout } from "./layout";
import TestimonialQuoteCard from "./TestimonialQuoteCard";

/**
 * A full-width section: heading, an optional large pull quote, then a grid of
 * quote cards. Reusable anywhere; `AboutTestimonials` feeds it from the
 * active preset.
 */
export default function TestimonialQuoteGrid({
  overline,
  heading,
  intro,
  pullQuote,
  items,
  className,
}: TestimonialQuoteGridConfig & { className?: string }) {
  const headingId = useId();
  if (!pullQuote && items.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "mx-auto max-w-[1440px] px-6 py-16 lg:px-14 lg:py-24",
        className,
      )}
    >
      <header className="max-w-3xl">
        {overline && (
          <p className="mb-4 font-body text-label font-bold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            {overline}
          </p>
        )}
        <h2 id={headingId} className="font-display text-headline text-white">
          {heading}
        </h2>
        {intro && (
          <p className="mt-5 font-body text-lead text-white/75">{intro}</p>
        )}
      </header>
      {pullQuote && (
        <figure className="m-0 mt-10 border-l-2 border-[var(--brand-accent)] bg-[linear-gradient(135deg,rgba(var(--brand-accent-rgb),.1),transparent_70%)] px-7 py-9 lg:mt-14 lg:px-14 lg:py-14">
          <span
            aria-hidden="true"
            className="block h-12 font-display text-8xl leading-none text-[var(--brand-accent)] lg:h-16 lg:text-9xl"
          >
            “
          </span>
          <blockquote className="max-w-5xl font-display text-[clamp(2rem,4.6vw,3.75rem)] leading-[1.08] text-white">
            <p>{pullQuote.quote}</p>
          </blockquote>
          <figcaption className="mt-8 font-body text-sm">
            <span className="block font-semibold text-white">
              {pullQuote.attribution}
            </span>
            {pullQuote.context && (
              <span className="mt-1 block text-white/70">
                {pullQuote.context}
              </span>
            )}
          </figcaption>
        </figure>
      )}
      {items.length > 0 && (
        <ul
          role="list"
          className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-6 lg:gap-6"
        >
          {items.map((item, index) => (
            <li
              key={`${item.attribution}-${index}`}
              className={quoteGridLayout(index, items.length)}
            >
              <TestimonialQuoteCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The About page quotes from the active preset. Renders nothing without them. */
export function AboutTestimonials({ className }: { className?: string }) {
  const { aboutTestimonials } = useSiteConfig();
  if (!aboutTestimonials) return null;
  return <TestimonialQuoteGrid {...aboutTestimonials} className={className} />;
}
