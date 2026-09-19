import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  FileText,
  PlayCircle,
  Search,
  Wrench,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Link, useNavigate } from "@/lib/router-compat";
import { offerPrice } from "@/lib/offers";
import {
  SHOP_CATEGORIES,
  shopHref,
  type ShopFilters,
  type ShopResult,
  type ShopCategory,
} from "@/lib/shop";

const categoryIcons = {
  training: PlayCircle,
  resource: FileText,
  tool: Wrench,
  course: BookOpen,
};
const filterClass =
  "inline-flex items-center rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
export default function Shop({
  catalog,
  filters,
}: {
  catalog: ShopResult;
  filters: ShopFilters;
}) {
  const [search, setSearch] = useState(filters.q);
  const navigate = useNavigate();
  useEffect(() => setSearch(filters.q), [filters.q]);
  const filtered =
    !!filters.q || filters.category !== "all" || filters.price !== "all";
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
          The shop
        </p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <h1 className="font-display text-4xl md:text-6xl leading-[1.1] max-w-2xl">
            Trainings, tools
            <br />
            <span className="italic" style={{ color: "var(--brand-accent)" }}>
              & resources.
            </span>
          </h1>
          <p className="max-w-md text-base md:text-lg text-white/75 leading-relaxed">
            Find a useful next step. Explore courses, practical trainings, and
            resources you can put to work—with free and paid options in one
            place.
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
                [["all", "All"], ...Object.entries(SHOP_CATEGORIES)] as [
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
            <nav
              className="flex flex-wrap gap-4 text-sm"
              aria-label="Price filter"
            >
              {(
                [
                  ["all", "Free & paid"],
                  ["free", "Free"],
                  ["paid", "Paid"],
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
          <>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-8">
              {catalog.items.map((offer) => {
                const Icon = categoryIcons[offer.shop_category] || FileText;
                return (
                  <article
                    key={offer.id}
                    className="group flex flex-col overflow-hidden rounded-lg border border-white/15 bg-white/[0.025] transition-colors hover:border-white/35"
                  >
                    <Link
                      to={`/offers/${offer.slug}`}
                      className="flex flex-col h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--brand-accent)]"
                      aria-label={`${offer.title} — ${offerPrice(offer)}`}
                    >
                      <div
                        className="relative aspect-[16/10] overflow-hidden border-b border-white/10"
                        style={{
                          background:
                            "radial-gradient(ellipse at top right, rgba(var(--brand-accent-rgb),0.18), transparent 75%)",
                        }}
                      >
                        {offer.cover_url ? (
                          <img
                            src={offer.cover_url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                            width={640}
                            height={400}
                          />
                        ) : (
                          <div className="flex h-full flex-col justify-between p-7">
                            <Icon
                              size={44}
                              strokeWidth={1.2}
                              style={{ color: "var(--brand-accent)" }}
                              aria-hidden="true"
                            />
                            <span className="font-display text-3xl text-white/85">
                              {SHOP_CATEGORIES[offer.shop_category]}
                            </span>
                          </div>
                        )}
                        {offer.shop_featured && (
                          <span className="absolute top-4 right-4 rounded-full border border-white/20 bg-black/80 px-3 py-1 text-xs font-semibold text-white">
                            Featured
                          </span>
                        )}
                      </div>
                      <div className="p-6 flex flex-col flex-1">
                        <p className="text-xs uppercase tracking-widest text-white/60">
                          {SHOP_CATEGORIES[offer.shop_category]}
                        </p>
                        {offer.checkout_mode === "external" && (
                          <p className="mt-2 text-xs text-white/70">
                            External offer
                          </p>
                        )}
                        <h2 className="font-display text-2xl leading-tight mt-3">
                          {offer.title}
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-white/75 line-clamp-3">
                          {offer.summary}
                        </p>
                        <div className="mt-auto pt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                          <span
                            className="font-semibold"
                            style={{ color: "var(--brand-accent)" }}
                          >
                            {offerPrice(offer)}
                          </span>
                          <span className="inline-flex items-center gap-2 text-sm text-white/80">
                            {offer.checkout_mode === "external"
                              ? "View details"
                              : offer.kind === "free"
                                ? "Get the details"
                                : "Explore offer"}
                            <ArrowRight size={17} aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
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
                ? "Try another category, a different search, or browse the full shop."
                : "New trainings, courses, tools, and downloads will appear here. In the meantime, explore the free resource library."}
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
