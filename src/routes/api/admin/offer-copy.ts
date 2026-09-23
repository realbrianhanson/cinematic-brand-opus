import { createFileRoute } from "@tanstack/react-router";
import { handleOfferCopy } from "@/lib/offerCopy.server";

export const Route = createFileRoute("/api/admin/offer-copy")({
  server: { handlers: { POST: ({ request }) => handleOfferCopy(request) } },
});
