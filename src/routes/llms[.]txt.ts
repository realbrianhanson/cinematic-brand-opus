import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/llms[.]txt")({
  server: {
    handlers: {
      GET: async () => {
        const { buildLlmsTxt } = await import("@/lib/feeds.server");
        try {
          const body = await buildLlmsTxt(false);
          return new Response(body, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error("llms.txt error:", error);
          return new Response("# Error\n", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
