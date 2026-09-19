import { createFileRoute } from "@tanstack/react-router";
import OfferAccess from "@/pages/OfferAccess";

export const Route = createFileRoute("/offer-access")({
  head: () => ({
    meta: [
      { title: "Your download" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: OfferAccess,
});
