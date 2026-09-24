import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Link, useNavigate } from "@/lib/router-compat";
import OfferCard from "@/components/OfferCard";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { isBrianOwner } from "@/lib/informationPages";
import {
  SHOP_CATEGORIES,
  shopHref,
  type ShopFilters,
  type ShopResult,
  type ShopCategory,
} from "@/lib/shop";

const filterClass =
  "inline-flex items-center rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
export default function Shop({
  catalog,
  filters,
}: {
  catalog: ShopResult;
  filters: ShopFilters;
}) {
  const config = useSiteConfig();
  const { identity } = config;
  const owner = isBrianOwner(config);
  const [search, setSearch] = useState(filters.q);
  const navigate = useNavigate();
  useEffect(() => setSearch(filters.q), [filters.q]);
  const filtered =
    !!filters.q || filters.category !== "all" || filters.price !== "all";
  const categories = Object.entries(SHOP_CATEGORIES).filter(
    ([value]) =>
      !catalog.availableFilters ||
      catalog.availableFilters.categories.includes(value as ShopCategory) ||
      filters.category === value,
  );
  const prices = (["free", "paid"] as const).filter(
    (value) =>
      !catalog.availableFilters ||
      catalog.availableFilters.prices.includes(value) ||
      filters.price === value,
  );
  const totalPages = Math.max(1, Math.ceil(catalog.total / catalog.pageSize));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(shopHref({ ...filters, q: search, page: 1 }));
  }
  return (
    <div
      className="min-h-screen font-body text-white"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <Nav />
      <header className="mx-auto max-w-[1440px] px-6 lg:px-14 pt-32 pb-10 md:pb-14">
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Shop" }]}
        />
        <p
          className="font-bold text-xs tracking-[0.22em] uppercase mt-7 mb-4"
          style={{ color: "var(--brand-accent)" }}
        >
          The shop · {identity.name}
        </p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <h1 className="font-display text-4xl md:text-6xl leading-[1.1] max-w-2xl">
            {owner ? "Tools and training" : "Good ideas"}
            <br />
            <span className="italic" style={{ color: "var(--brand-accent)" }}>
              {owner ? "to build with AI" : "A place to start"}
            </span>
          </h1>
          <p className="max-w-md text-base md:text-lg text-white/75 leading-relaxed">
            {owner
              ? "Start with the free kit. Then pick the training or tool that fits your next build"
              : "Practical training, useful tools, and resources worth returning to. Find the next step that fits what you want to learn or build"}
          </p>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-6 lg:px-14 pb-24"
      >
        <section
          aria-label="Shop filters"
          className="border-y border-white/15 py-6 space-y-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <nav
              aria-label="Product categories"
              className="flex flex-wrap gap-2"
            >
              {(
                [["all", "All"], ...categories] as [
                  ShopCategory | "all",
                  string,
                ][]
              ).map(([value, label]) => (
                <Link
                  key={value}
                  to={shopHref({ ...filters, category: value, page: 1 })}
                  aria-current={filters.category === value ? "true" : undefined}
                  className={`${filterClass} ${filters.category === value ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--brand-backdrop)] font-bold" : "border-white/20 text-white/80 hover:border-white/60"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <form
              action="/shop"
              method="get"
              onSubmit={submit}
              role="search"
              className="flex gap-2 w-full lg:max-w-sm"
            >
              {filters.category !== "all" && (
                <input type="hidden" name="category" value={filters.category} />
              )}
              {filters.price !== "all" && (
                <input type="hidden" name="price" value={filters.price} />
              )}
              <label htmlFor="shop-search" className="sr-only">
                Search the shop by title
              </label>
              <input
                id="shop-search"
                name="q"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={100}
                placeholder="Search the shop…"
                className="min-w-0 flex-1 rounded border border-white/25 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
              />
              <button
                type="submit"
                aria-label="Search shop"
                className="rounded border border-white/25 px-4 hover:bg-white/10"
              >
                <Search size={19} aria-hidden="true" />
              </button>
            </form>
          </div>
          <div className="flex flex-wrap justify-between items-center gap-4">
            {(prices.length > 1 || filters.price !== "all") && (
              <nav
                className="flex flex-wrap gap-4 text-sm"
                aria-label="Price filter"
              >
                {(
                  [
                    ["all", "All prices"],
                    ...prices.map(
                      (price) =>
                        [price, price === "free" ? "Free" : "Paid"] as const,
                    ),
                  ] as const
                ).map(([value, label]) => (
                  <Link
                    key={value}
                    to={shopHref({ ...filters, price: value, page: 1 })}
                    aria-current={filters.price === value ? "true" : undefined}
                    className={
                      filters.price === value
                        ? "font-semibold underline underline-offset-8 decoration-[var(--brand-accent)] text-white"
                        : "text-white/65 hover:text-white"
                    }
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            )}
            <p className="text-sm text-white/65" role="status">
              {catalog.total} {catalog.total === 1 ? "item" : "items"}
              {filters.q && <> matching “{filters.q}”</>}
              {filtered && (
                <Link
                  to="/shop"
                  className="ml-3 text-white underline underline-offset-4"
                >
                  Clear filters
                </Link>
              )}
            </p>
          </div>
        </section>
        {catalog.items.length ? (
          <div
            className={`mt-9 grid gap-6 ${catalog.items.length === 1 ? "max-w-2xl" : catalog.items.length === 2 ? "md:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}
          >
            {catalog.items.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                compact={catalog.items.length > 2}
              />
            ))}
          </div>
        ) : (
          <section
            className="my-10 rounded-lg border border-white/15 px-6 py-14 md:py-20 text-center"
            aria-label="Shop results"
          >
            <BookOpen
              size={32}
              strokeWidth={1.4}
              className="mx-auto mb-5"
              style={{ color: "var(--brand-accent)" }}
              aria-hidden="true"
            />
            <h2 className="font-display text-3xl">
              {filtered || filters.page > 1
                ? "No items here yet"
                : "Something useful is on the way"}
            </h2>
            <p className="text-white/70 max-w-md mx-auto mt-4 leading-relaxed">
              {filtered || filters.page > 1
                ? "Try another category, a different search, or browse the full shop"
                : "New trainings, courses, tools, and downloads will appear here. Until then, explore the free resource library"}
            </p>
            <Link
              to={filtered || filters.page > 1 ? "/shop" : "/resources"}
              className="inline-flex items-center gap-2 mt-7 px-5 py-3 rounded font-semibold"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-backdrop)",
              }}
            >
              {filtered || filters.page > 1
                ? "Browse all items"
                : "Explore free resources"}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>
        )}
        {(totalPages > 1 || filters.page > 1) && (
          <nav
            aria-label="Shop pages"
            className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm"
          >
            {filters.page > 1 && (
              <Link
                to={shopHref({ ...filters, page: filters.page - 1 })}
                className="underline underline-offset-4"
              >
                Previous page
              </Link>
            )}
            <span className="text-white/70">
              Page {filters.page}
              {filters.page <= totalPages && ` of ${totalPages}`}
            </span>
            {filters.page < totalPages && (
              <Link
                to={shopHref({ ...filters, page: filters.page + 1 })}
                className="underline underline-offset-4"
              >
                Next page
              </Link>
            )}
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
