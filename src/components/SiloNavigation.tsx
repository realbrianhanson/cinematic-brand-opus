import { fetchGuideResources, type GuideResource } from "@/lib/publicLists";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SiloNavigationProps {
  nicheId: string;
  pillarTitle: string;
  initialPages?: GuideResource[] | null;
}

const SiloNavigation = ({ nicheId, initialPages }: SiloNavigationProps) => {
  const {
    data: pages,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["silo-nav-pages", nicheId],
    queryFn: () => fetchGuideResources(supabase, nicheId),
    enabled: !!nicheId,
    staleTime: 30000,
    ...(initialPages ? { initialData: initialPages } : {}),
  });

  const grouped: Record<
    string,
    { name: string; pages: NonNullable<typeof pages> }
  > = Object.create(null);
  (pages ?? []).forEach((pg) => {
    const schemaSlug = pg.content_schemas?.slug ?? "other";
    const schemaName = pg.content_schemas?.name ?? "Other";
    if (!grouped[schemaSlug])
      grouped[schemaSlug] = { name: schemaName, pages: [] };
    grouped[schemaSlug].pages.push(pg);
  });

  if (isError && !pages?.length)
    return (
      <p role="status">
        Related resources could not be loaded.{" "}
        <button
          type="button"
          className="underline min-h-12"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </p>
    );
  if (Object.keys(grouped).length === 0) return null;

  return (
    <section
      style={{
        marginTop: 64,
        paddingTop: 40,
        borderTop: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.08)",
      }}
    >
      <h2 className="font-display" style={{ fontSize: 28, marginBottom: 28 }}>
        Resources for This Guide
      </h2>
      {Object.entries(grouped).map(([schemaSlug, group]) => (
        <div key={schemaSlug} style={{ marginBottom: 28 }}>
          <h3
            className="font-body"
            style={{
              fontSize: 14,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--site-accent-ink, hsl(var(--accent)))",
              marginBottom: 12,
            }}
          >
            {group.name}
          </h3>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {group.pages.map((pg) => {
              const nSlug = pg.slug;
              return (
                <li key={pg.id}>
                  <a
                    href={`/resources/${schemaSlug}/${nSlug}`}
                    className="font-body"
                    style={{
                      fontSize: 14,
                      color: "var(--site-text-65, rgba(255,255,255,0.65))",
                      textDecoration: "none",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color =
                        "var(--site-accent-ink, hsl(var(--accent)))")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color =
                        "var(--site-text-65, rgba(255,255,255,0.65))")
                    }
                  >
                    → {pg.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
};

export default SiloNavigation;
