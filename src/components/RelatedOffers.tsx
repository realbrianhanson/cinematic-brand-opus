import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { offerPrice } from "@/lib/offers";
import { SHOP_CATEGORIES, type ShopOffer } from "@/lib/shop";

export default function RelatedOffers({ offers }: { offers: ShopOffer[] }) {
  if (!offers.length) return null;
  return (
    <section
      aria-labelledby="related-offers-heading"
      className="mt-16 border-t border-white/15 pt-10 lg:mt-24"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2
          id="related-offers-heading"
          className="font-display text-3xl text-white"
        >
          More ways to move forward
        </h2>
        <Link
          to="/shop"
          className="text-xs font-semibold text-[var(--brand-accent)] underline underline-offset-4"
        >
          See the full Shop
        </Link>
      </div>
      <div
        className={`grid gap-4 ${offers.length > 1 ? "md:grid-cols-2" : ""}`}
      >
        {offers.map((offer) => (
          <Link
            key={offer.id}
            to={`/offers/${offer.slug}`}
            className="group flex min-w-0 items-center justify-between gap-6 rounded-xl border border-white/15 p-5 transition-colors hover:border-[var(--brand-accent)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">
                {SHOP_CATEGORIES[offer.shop_category]}
              </p>
              <h3 className="mt-2 font-display text-2xl text-white">
                {offer.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--brand-accent)]">
                {offerPrice(offer)}
              </p>
            </div>
            <ArrowUpRight
              size={22}
              className="shrink-0 text-[var(--brand-accent)]"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
