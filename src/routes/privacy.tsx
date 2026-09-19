import { createFileRoute } from "@tanstack/react-router";
import SitePolicy from "@/pages/SitePolicy";
import { informationPageHead } from "@/lib/informationPages";

export const Route = createFileRoute("/privacy")({
  head: ({ matches }) => informationPageHead("/privacy", matches),
  component: () => <SitePolicy kind="privacy" />,
});
