import { useParams } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { getPublicContentType } from "@/lib/publicData.functions";
import { resourceArchivePath } from "../../supabase/functions/_shared/resourcePagination";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import PublicCTA from "@/components/PublicCTA";
import Breadcrumbs from "@/components/Breadcrumbs";

type ResourceListing = Awaited<ReturnType<typeof getPublicContentType>>;
interface ContentTypeListProps {
  initialResult?: ResourceListing;
  page?: number;
  niche?: string;
}

export default function ContentTypeList({
  initialResult,
  page = 1,
  niche = "",
}: ContentTypeListProps) {
  const { contentType = "" } = useParams<{ contentType: string }>();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["public-resource-category", contentType, page, niche],
    queryFn: () => getPublicContentType({ data: { contentType, page, niche } }),
    ...(initialResult ? { initialData: initialResult } : {}),
    staleTime: 60_000,
    retry: 1,
  });
  const schema = data?.schema;
  return (
    <div className="min-h-screen bg-[var(--brand-backdrop)] text-white">
      <Nav />
      <header className="mx-auto max-w-6xl px-6 pt-32 pb-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Resources", href: "/resources" },
            { label: schema?.name || "Resources" },
          ]}
        />
        <h1 className="font-display text-4xl sm:text-5xl">
          {schema?.name || (isPending ? "Loading resources…" : "Resources")}
        </h1>
        {schema?.description && (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80">
            {schema.description}
          </p>
        )}
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-6 pb-24">
        {!!data?.niches.length && (
          <form
            method="get"
            action={resourceArchivePath(contentType)}
            className="mb-8 flex flex-wrap items-end gap-3"
          >
            <label className="grid gap-2 text-base">
              Filter by industry
              <select
                key={niche}
                name="niche"
                defaultValue={niche}
                className="rounded border border-white/25 bg-[var(--brand-backdrop)] px-3 py-3 text-white"
              >
                <option value="">All industries</option>
                {data.niches.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded border border-[var(--brand-accent)] px-4 py-3 text-[var(--brand-accent)]">
              Apply filter
            </button>
          </form>
        )}
        {isError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-300/40 p-5 text-red-100"
          >
            <p>
              {data
                ? "These resources could not be refreshed. The last loaded results are still shown."
                : "These resources could not be loaded. Please try again."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="mt-3 underline"
            >
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}
        {isPending && <p role="status">Loading resources…</p>}
        {data && (
          <>
            <p className="mb-6 text-sm text-white/75">
              Page {page} · {data.pages.length}{" "}
              {data.pages.length === 1 ? "resource" : "resources"} on this page
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              {data.pages.map((item) => (
                <a
                  key={item.id}
                  href={`/resources/${encodeURIComponent(contentType)}/${encodeURIComponent(item.slug)}`}
                  className="group rounded-lg border border-white/15 bg-white/[0.025] p-6 transition-colors hover:border-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
                >
                  {item.niches?.name && (
                    <p className="mb-3 text-sm text-[var(--brand-accent)]">
                      {item.niches.name}
                    </p>
                  )}
                  <h2 className="font-display text-2xl leading-snug">
                    {item.title}
                  </h2>
                  <p className="mt-5 text-base text-white/80 group-hover:text-[var(--brand-accent)]">
                    Read resource →
                  </p>
                </a>
              ))}
            </div>
            {!data.pages.length && (
              <p className="rounded border border-white/15 p-6">
                No published resources match this industry.{" "}
                <a
                  className="underline"
                  href={resourceArchivePath(contentType)}
                >
                  See all industries
                </a>
              </p>
            )}
            {(page > 1 || data.nextPage !== null) && (
              <nav
                aria-label="Resource pages"
                className="my-8 flex flex-wrap items-center justify-between gap-4"
              >
                {page > 1 ? (
                  <a
                    className="rounded border border-white/25 px-4 py-3"
                    href={resourceArchivePath(contentType, page - 1, niche)}
                  >
                    ← Previous page
                  </a>
                ) : (
                  <span />
                )}
                <span aria-current="page">Page {page}</span>
                {data.nextPage !== null ? (
                  <a
                    className="rounded border border-white/25 px-4 py-3"
                    href={resourceArchivePath(
                      contentType,
                      data.nextPage,
                      niche,
                    )}
                  >
                    Next page →
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
        <PublicCTA
          variant="end"
          contentTypeSlug={contentType}
          pageType="content-type-list"
        />
      </main>
      <Footer />
    </div>
  );
}
