import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OfferExperiments from "@/components/admin/OfferExperiments";
export const Route = createFileRoute("/admin/experiments")({
  head: adminHead("Offer experiments"),
  component: OfferExperiments,
});
