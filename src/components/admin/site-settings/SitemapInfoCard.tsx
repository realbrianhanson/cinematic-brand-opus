import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Globe } from "lucide-react";
import { countSitemapUrls, robotsSitemapCheck } from "./crawlerStatus";

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 6,
  backgroundColor: "hsl(var(--admin-surface-2))",
  border: "1px solid hsl(var(--admin-border))",
  minWidth: 0,
} as const;
const OK = "hsl(120 60% 40%)";
const BAD = "hsl(0 70% 50%)";

async function fetchText(path: string): Promise<string | null> {
  const res = await fetch(path, { cache: "no-store" });
  return res.ok ? res.text() : null;
}

/**
 * Reads the same /sitemap.xml and /robots.txt that crawlers read, so the
 * counts cannot drift from buildSitemapXml() in src/lib/feeds.server.ts.
 */
export function SitemapInfoCard({ siteUrl }: { siteUrl: string }) {
  const sitemap = useQuery({
    queryKey: ["admin-live-sitemap-count"],
    queryFn: async () => {
      const xml = await fetchText("/sitemap.xml");
      return xml === null ? null : countSitemapUrls(xml);
    },
    staleTime: 5 * 60 * 1000,
  });
  const robots = useQuery({
    queryKey: ["admin-live-robots"],
    queryFn: () => fetchText("/robots.txt"),
    staleTime: 5 * 60 * 1000,
  });
  const robotsState =
    robots.data == null ? null : robotsSitemapCheck(robots.data, siteUrl);

  const robotsLabel = robots.isPending
    ? { text: "Checking…", color: "hsl(var(--admin-text-ghost))" }
    : robotsState?.state === "missing"
      ? { text: "No Sitemap line", color: BAD }
      : robotsState
        ? { text: "Active", color: OK }
        : { text: "Not reachable", color: BAD };

  const count = sitemap.data;
  const sitemapText = sitemap.isPending
    ? "Counting sitemap URLs…"
    : typeof count === "number"
      ? `${count} URLs in sitemap`
      : "Sitemap unavailable";

  return (
    <section className="admin-card min-w-0" style={{ padding: 24 }}>
      <h2
        className="font-body"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Globe
          size={16}
          aria-hidden
          style={{ color: "hsl(var(--admin-accent))" }}
        />
        Sitemap &amp; Crawlers
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={rowStyle}>
          <FileText
            size={14}
            aria-hidden
            style={{ color: "hsl(var(--admin-text-ghost))", flexShrink: 0 }}
          />
          <span
            className="font-body"
            style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
          >
            robots.txt:{" "}
            <span style={{ color: robotsLabel.color }}>{robotsLabel.text}</span>
          </span>
        </div>
        <div style={rowStyle}>
          <FileText
            size={14}
            aria-hidden
            style={{ color: "hsl(var(--admin-text-ghost))", flexShrink: 0 }}
          />
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body"
            style={{
              fontSize: 12,
              color:
                typeof count === "number" || sitemap.isPending
                  ? "hsl(var(--admin-text-soft))"
                  : BAD,
            }}
          >
            {sitemapText}
          </a>
        </div>
        {robotsState?.state === "mismatch" && (
          <div
            role="status"
            style={{
              ...rowStyle,
              alignItems: "flex-start",
              backgroundColor: "hsl(40 90% 55% / 0.08)",
              border: "1px solid hsl(40 90% 55% / 0.2)",
            }}
          >
            <AlertTriangle
              size={14}
              aria-hidden
              style={{ color: "hsl(40 90% 45%)", flexShrink: 0, marginTop: 1 }}
            />
            <span
              className="font-body"
              style={{ fontSize: 11, lineHeight: 1.5 }}
            >
              {robotsState.message}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
