import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap[.]xml")({
  server: {
    handlers: {
      GET: async () => {
        const { buildSitemapXml } = await import("@/lib/feeds.server");
        try {
          const xml = await buildSitemapXml();
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("sitemap.xml error:", error);
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><error>sitemap unavailable</error>`,
            { status: 500, headers: { "Content-Type": "application/xml" } },
          );
        }
      },
    },
  },
});
