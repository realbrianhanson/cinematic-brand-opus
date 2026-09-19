import { createFileRoute } from "@tanstack/react-router";
import Support from "@/pages/Support";
import { informationPageHead } from "@/lib/informationPages";

export const Route = createFileRoute("/support")({
  head: ({ matches }) => informationPageHead("/support", matches),
  component: Support,
});
