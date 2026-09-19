import { useSiteConfig } from "@/config/SiteConfigContext";
import HomeSectionHeading from "./HomeSectionHeading";

export default function HomeTestimonials() {
  const { homepageTestimonials } = useSiteConfig();
  if (!homepageTestimonials?.items.length) return null;

  return (
    <section
      id="testimonials"
      aria-label={homepageTestimonials.heading}
      className="py-16 lg:py-24"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <HomeSectionHeading
          overline={homepageTestimonials.overline}
          intro={homepageTestimonials.intro}
        >
          {homepageTestimonials.heading}
        </HomeSectionHeading>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {homepageTestimonials.items.map((item) => (
            <figure
              key={`${item.attribution}-${item.quote}`}
              className="m-0 flex min-w-0 flex-col border border-white/15 bg-white/[0.025] p-6 lg:p-8"
            >
              <span
                aria-hidden="true"
                className="font-display text-5xl leading-none mb-3"
                style={{ color: "var(--brand-accent)" }}
              >
                “
              </span>
              <blockquote className="font-body text-base leading-relaxed text-white/80 break-words">
                <p>{item.quote}</p>
              </blockquote>
              <figcaption className="mt-auto pt-6 font-body break-words">
                <span className="block text-sm font-semibold text-white">
                  {item.attribution}
                </span>
                {item.context && (
                  <span className="mt-1 block text-xs leading-relaxed text-white/65">
                    {item.context}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
