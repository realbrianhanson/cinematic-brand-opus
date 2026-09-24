import { useId } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import type { SpeakingTestimonialsConfig } from "@/config/types";
import { cn } from "@/lib/utils";
import TestimonialGroupLabel from "./TestimonialGroupLabel";
import TestimonialQuoteCard from "./TestimonialQuoteCard";

/**
 * A compact pair of quotes for the speaking page. Reads the active preset
 * unless `config` is passed, and renders nothing when there are no quotes.
 */
export default function SpeakingTestimonials({
  config,
  className,
}: {
  config?: SpeakingTestimonialsConfig;
  className?: string;
}) {
  const { speakingTestimonials } = useSiteConfig();
  const headingId = useId();
  const data = config ?? speakingTestimonials;
  if (!data?.items.length) return null;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "mx-auto max-w-[1440px] px-6 py-14 lg:px-14 lg:py-20",
        className,
      )}
    >
      <TestimonialGroupLabel as="h2" id={headingId}>
        {data.label}
      </TestimonialGroupLabel>
      <ul role="list" className="mt-7 grid gap-5 md:grid-cols-2 lg:gap-6">
        {data.items.map((item, index) => (
          <li key={`${item.attribution}-${index}`}>
            <TestimonialQuoteCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
