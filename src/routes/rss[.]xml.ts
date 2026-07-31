import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { buildRssXml } = await import("@/lib/feeds.server");
        try {
          const xml = await buildRssXml();
          return new Response(xml, {
            headers: {
              "Content-Type": "application/rss+xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("rss.xml error:", error);
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><error>feed unavailable</error>`,
            { status: 500, headers: { "Content-Type": "application/xml" } },
          );
        }
      },
    },
  },
});
