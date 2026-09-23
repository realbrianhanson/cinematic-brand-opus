import { createFileRoute } from "@tanstack/react-router";
import AudienceManager from "@/components/admin/AudienceManager";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin/audience")({
  head: adminHead("Newsletter audience"),
  component: AudienceManager,
});
