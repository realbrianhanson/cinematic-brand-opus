import { createFileRoute } from "@tanstack/react-router";
import OffersManager from "@/components/admin/OffersManager";

export const Route = createFileRoute("/admin/offers/")({
  component: OffersManager,
});
