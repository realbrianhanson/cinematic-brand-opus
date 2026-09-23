import { createFileRoute } from "@tanstack/react-router";
import AudienceManager from "@/components/admin/AudienceManager";

export const Route = createFileRoute("/admin/audience")({
  component: AudienceManager,
});
