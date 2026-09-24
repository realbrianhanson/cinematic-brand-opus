import { createFileRoute } from "@tanstack/react-router";
import { handleSiteChatRequest } from "@/lib/siteChat.server";

/**
 * Public product Q&A assistant. Origin, body size, message shape and durable
 * rate limits are all enforced in siteChatGuard.server.ts before any model call.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleSiteChatRequest(request),
    },
  },
});
