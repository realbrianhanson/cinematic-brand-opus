import { createFileRoute } from "@tanstack/react-router";
import SitePolicy from "@/pages/SitePolicy";
import { informationPageHead } from "@/lib/informationPages";

export const Route = createFileRoute("/terms")({
  head: ({ matches }) => informationPageHead("/terms", matches),
  component: () => <SitePolicy kind="terms" />,
});
