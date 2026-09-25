import { ArrowUpRight } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { Link } from "@/lib/router-compat";
import type { ShopOffer } from "@/lib/shop";

const excerpt =
  "From a newbie in AI...Push Ten has taught me to build websites in a couple hours. I had no experience in this, but I really feel more confident now.";

/** A source-backed participant account, shown only beside its actual offer. */
export default function OfferBuildExample({
  offers,
}: {
  offers: Pick<ShopOffer, "slug">[];
}) {
  const config = useSiteConfig();
  if (config.preset !== "brian") return null;
  const offer = offers.find((item) => item.slug === "pushten");
  const testimonial = config.homepageTestimonials?.groups
    ?.flatMap((group) => group.items)
    .find((item) => item.attribution === "Susie Satram");
  if (!offer || !testimonial?.quote.startsWith(excerpt)) return null;
  return (
    <aside
      aria-labelledby="build-example-heading"
      className="mt-8 grid gap-7 rounded-xl border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/5 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--brand-accent)]">
          A participant’s experience
        </p>
        <h3
          id="build-example-heading"
          className="mt-4 font-display text-2xl leading-tight text-white sm:text-3xl"
        >
          From AI beginner to building websites
        </h3>
        <dl className="mt-6 space-y-4 text-sm leading-relaxed">
          <div>
            <dt className="font-semibold text-white">Starting point</dt>
            <dd className="mt-1 text-white/75">
              Susie described herself as new to AI, with no experience building
              websites.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">What helped</dt>
            <dd className="mt-1 text-white/75">
              She credited PushTen’s teaching and support.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-white">What she reported</dt>
            <dd className="mt-1 text-white/75">
              Building websites in a couple of hours and feeling more confident.
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col justify-center">
        <figure>
          <blockquote className="font-display text-xl leading-relaxed text-white sm:text-2xl">
            <p>“{excerpt}”</p>
          </blockquote>
          <figcaption className="mt-4 text-sm text-white/70">
            <span className="font-semibold text-white">
              {testimonial.attribution}
            </span>
            <span className="mt-1 block">{testimonial.context}</span>
          </figcaption>
        </figure>
        <p className="mt-4 text-sm leading-relaxed text-white/65">
          Her account of her own experience. Project scope and build time vary.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
          <Link
            to="/offers/pushten"
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--brand-accent)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            See what PushTen includes{" "}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <a
            href="#testimonials"
            className="inline-flex min-h-11 items-center text-sm text-white/75 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Read her full message and screenshot
          </a>
        </div>
      </div>
    </aside>
  );
}
