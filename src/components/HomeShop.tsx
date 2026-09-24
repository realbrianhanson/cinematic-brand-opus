import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import type { ShopOffer } from "@/lib/shop";
import OfferCard from "./OfferCard";

export default function HomeShop({ offers }: { offers: ShopOffer[] }) {
  if (!offers.length) return null;
  return (
    <section
      id="shop"
      aria-labelledby="home-shop-heading"
      className="relative mx-auto max-w-[1440px] px-6 py-20 md:py-28 lg:px-14"
    >
      <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent)]">
            The Shop
          </p>
          <h2
            id="home-shop-heading"
            className="mt-5 max-w-2xl font-display text-4xl leading-[1.04] text-white sm:text-5xl lg:text-6xl"
          >
            Your next step,
            <br />
            <span className="italic text-[var(--brand-accent)]">
              ready when you are
            </span>
          </h2>
        </div>
        <div className="max-w-sm">
          <p className="mb-5 text-sm leading-relaxed text-white/70">
            Training, resources, and tools you can make your own. Start free and
            build from there
          </p>
          <Link
            to="/shop"
            className="inline-flex items-center gap-3 border-b border-[var(--brand-accent)]/60 pb-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
          >
            Browse the Shop
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div
        className={`grid gap-6 ${offers.length === 1 ? "max-w-2xl" : offers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}
      >
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            compact={offers.length > 2}
            headingLevel="h3"
          />
        ))}
      </div>
    </section>
  );
}
