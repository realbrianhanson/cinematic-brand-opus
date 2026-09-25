import { useEffect, useState } from "react";
import { z } from "zod";
import { useSearchParams } from "@/lib/router-compat";
import type {
  PublicPost,
  PublicPillar,
  PublicGeneratedPage,
  PublicSiteSettings,
  PublicNewsItem,
} from "@/lib/publicTypes";
import type { Tables, Json } from "@/integrations/supabase/types";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  ArrowRight,
  List,
  CheckSquare,
  BookOpen,
  Wrench,
  FileText,
  HelpCircle,
} from "lucide-react";
import PageHead from "@/components/PageHead";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import PublicCTA from "@/components/PublicCTA";
import Breadcrumbs from "@/components/Breadcrumbs";

const rendererIcons: Record<string, typeof List> = {
  IdeaListRenderer: List,
  ChecklistRenderer: CheckSquare,
  GuideRenderer: BookOpen,
  ToolRoundupRenderer: Wrench,
  TemplateRenderer: FileText,
  FAQRenderer: HelpCircle,
};

const resultsSchema = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      path: z.string(),
    }),
  ),
});
interface ResourcesIndexProps {
  guides?: {
    id: string;
    title: string;
    slug: string;
    meta_description: string | null;
  }[];
  initialSchemas?: unknown[] | null;
  initialCounts?: Record<string, number> | null;
  initialSettings?: PublicSiteSettings | null;
}

const ResourcesIndex = ({
  guides = [],
  initialSchemas,
  initialCounts,
  initialSettings,
}: ResourcesIndexProps = {}) => {
  const siteConfig = useSiteConfig();
  const [params, setParams] = useSearchParams();
  const term = (params.get("q") || "").slice(0, 200);
  const [input, setInput] = useState(term);
  const requestedPage = Number(params.get("page") || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage - 1, 1000)
      : 0;
  useEffect(() => setInput(term), [term]);
  const updateSearch = (query: string, nextPage = 0) => {
    setParams((current) => {
      if (query) current.set("q", query);
      else current.delete("q");
      if (query && nextPage > 0) current.set("page", String(nextPage + 1));
      else current.delete("page");
      return current;
    });
  };
  const search = useQuery({
    queryKey: ["public-library-search", term, page],
    enabled: !!term,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_public_library", {
        term,
        page,
      });
      if (error) throw error;
      return resultsSchema.parse(data);
    },
  });

  const { data: schemas } = useQuery({
    queryKey: ["public-content-schemas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_schemas")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    ...(initialSchemas
      ? { initialData: initialSchemas as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  const { data: pageCounts } = useQuery({
    queryKey: ["public-page-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_resource_counts");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((p) => {
        if (p.content_schema_id) counts[p.content_schema_id] = p.page_count;
      });
      return counts;
    },
    ...(initialCounts
      ? { initialData: initialCounts as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select(
          "id, site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof, publisher_name, publisher_url, updated_at",
        )
        .limit(1)
        .maybeSingle();
      return data;
    },
    ...(initialSettings
      ? { initialData: initialSettings as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--brand-backdrop)", color: "#fff" }}
    >
      <Nav />
      <header
        className="pt-32 pb-16 px-6 lg:px-14 mx-auto"
        style={{ maxWidth: 1440 }}
      >
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Resources" }]}
        />
        <h1
          className="font-display"
          style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.1 }}
        >
          Free Resources
          {settings?.publisher_name ? ` from ${settings.publisher_name}` : ""}
        </h1>
        <p
          className="font-body mt-4"
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.7)",
            maxWidth: 560,
          }}
        >
          {siteConfig.content.resourceDescription}
        </p>
      </header>

      <main
        id="main-content"
        className="px-6 lg:px-14 pb-24 mx-auto"
        style={{ maxWidth: 1440 }}
      >
        <form
          className="flex gap-3 mb-10"
          onSubmit={(e) => {
            e.preventDefault();
            updateSearch(input.trim().slice(0, 200));
          }}
          role="search"
        >
          <label className="sr-only" htmlFor="library-search">
            Search articles, guides, and resources
          </label>
          <input
            id="library-search"
            className="flex-1 min-w-0 rounded-lg border border-white/25 bg-white/5 text-white px-4 py-3"
            placeholder="Find a workflow, topic, or tool…"
            maxLength={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            className="rounded-lg px-5 py-3 font-semibold text-black"
            style={{ background: "var(--brand-accent)" }}
          >
            Search
          </button>
        </form>
        {term ? (
          <section aria-label="Search results">
            <div className="flex justify-between gap-4 mb-6">
              <h2 className="text-xl">Results for “{term}”</h2>
              <button
                className="underline"
                onClick={() => {
                  setInput("");
                  updateSearch("");
                }}
              >
                Clear search
              </button>
            </div>
            {search.isPending && <p role="status">Searching the library…</p>}
            {search.error && (
              <p role="alert">
                Search could not be loaded.{" "}
                <button onClick={() => search.refetch()} className="underline">
                  Try again
                </button>
              </p>
            )}
            {search.data && !search.error && (
              <>
                <p
                  className="mb-5 text-white/70"
                  role="status"
                  aria-live="polite"
                >
                  {search.data.total} result{search.data.total === 1 ? "" : "s"}
                  {search.data.total > 24 &&
                    ` · Page ${page + 1} of ${Math.ceil(search.data.total / 24)}`}
                </p>
                <div className="grid md:grid-cols-2 gap-5">
                  {search.data.items.map((item) => (
                    <Link
                      to={item.path}
                      key={item.path}
                      className="public-discovery-card"
                    >
                      <p className="uppercase text-xs mb-3">{item.kind}</p>
                      <h2>{item.title}</h2>
                      <p>{item.description}</p>
                      <span>Read more →</span>
                    </Link>
                  ))}
                </div>
                {!search.data.total && (
                  <p>Try a broader topic or a different tool name</p>
                )}
                <div className="flex gap-4 mt-6">
                  <button
                    disabled={!page}
                    className="underline disabled:opacity-30"
                    onClick={() => updateSearch(term, page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={(page + 1) * 24 >= search.data.total}
                    className="underline disabled:opacity-30"
                    onClick={() => updateSearch(term, page + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <>
            {guides.length > 0 && (
              <section className="mb-12" aria-label="Start with your goal">
                <h2 className="font-display text-3xl mb-3">
                  Start with your goal
                </h2>
                <p className="text-white/70 mb-6">
                  Choose a topic, find a practical starting point, and work
                  through the related guides
                </p>
                <div className="grid md:grid-cols-3 gap-5">
                  {guides.map((g) => (
                    <Link
                      to={`/guides/${g.slug}`}
                      key={g.id}
                      className="public-discovery-card"
                    >
                      <h2>{g.title}</h2>
                      <p>{g.meta_description}</p>
                      <span>Explore the guide →</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <h2 className="font-display text-3xl mb-6">Browse by format</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {schemas
                ?.filter((s) => (pageCounts?.[s.id] || 0) > 0)
                .map((s) => {
                  const Icon = rendererIcons[s.renderer_component] || List;
                  const count = pageCounts?.[s.id] || 0;
                  return (
                    <Link
                      to={`/resources/${s.slug}`}
                      key={s.id}
                      className="group block p-8"
                      style={{
                        border: "1px solid rgba(255,255,255,0.06)",
                        transition: "border-color 0.3s, transform 0.3s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          "rgba(var(--brand-accent-rgb),0.25)";
                        e.currentTarget.style.transform = "translateY(-4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor =
                          "rgba(255,255,255,0.06)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      <Icon
                        size={28}
                        style={{
                          color: "var(--brand-accent)",
                          marginBottom: 16,
                        }}
                        strokeWidth={1.5}
                      />
                      <h2
                        className="font-display mb-2 transition-colors group-hover:text-[var(--brand-accent)]"
                        style={{ fontSize: 22, lineHeight: 1.3 }}
                      >
                        {s.name}
                      </h2>
                      {s.description && (
                        <p
                          className="font-body mb-4"
                          style={{
                            fontSize: 13,
                            color: "rgba(255,255,255,0.7)",
                            lineHeight: 1.6,
                          }}
                        >
                          {s.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span
                          className="font-body"
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.65)",
                          }}
                        >
                          {count} resource{count !== 1 ? "s" : ""} available
                        </span>
                        <span
                          className="font-body uppercase flex items-center gap-1 transition-colors group-hover:text-[var(--brand-accent)]"
                          style={{
                            fontSize: 12,
                            letterSpacing: "0.15em",
                            color: "rgba(255,255,255,0.7)",
                          }}
                        >
                          Browse <ArrowRight size={12} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </>
        )}
        <PublicCTA variant="end" pageType="resources-index" />
      </main>
      <Footer />
    </div>
  );
};

export default ResourcesIndex;
