import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { offerPrice } from "@/lib/offers";
import { SHOP_CATEGORIES, type ShopOffer } from "@/lib/shop";
import OfferArtwork from "./OfferArtwork";

const cta = {
  training: "Explore the training",
  resource: "Explore the resource",
  tool: "Explore the tools",
  course: "Explore the course",
};

export default function OfferCard({
  offer,
  compact = false,
  headingLevel = "h2",
}: {
  offer: ShopOffer;
  compact?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-white/[0.025] transition-colors hover:border-[var(--brand-accent)]/55">
      <Link
        to={`/offers/${offer.slug}`}
        aria-label={`${offer.title} — ${offerPrice(offer)}`}
        className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--brand-accent)]"
      >
        <div
          className={`${offer.cover_url ? (compact ? "aspect-[16/9]" : "aspect-[16/9] sm:aspect-[16/8]") : ""} overflow-hidden border-b border-white/10`}
        >
          <OfferArtwork offer={offer} compact={compact} />
        </div>
        <div className="flex flex-1 flex-col p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]">
            <span className="text-white/65">
              {SHOP_CATEGORIES[offer.shop_category]}
            </span>
            {offer.shop_featured && (
              <span className="rounded-full border border-[var(--brand-accent)]/25 px-2.5 py-1 text-[var(--brand-accent)]">
                Featured
              </span>
            )}
            {offer.is_affiliate && (
              <span className="rounded-full border border-white/20 px-2.5 py-1 text-white/70">
                Affiliate pick
              </span>
            )}
          </div>
          <Heading className="mt-4 font-display text-3xl leading-[1.08] text-white">
            {offer.title}
          </Heading>
          <p className="mt-4 mb-7 max-w-lg text-sm leading-relaxed text-white/70">
            {offer.summary}
          </p>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5">
            <span className="text-base font-semibold text-[var(--brand-accent)]">
              {offerPrice(offer)}
            </span>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/85">
              {cta[offer.shop_category] || "View details"}
              <ArrowUpRight size={17} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
