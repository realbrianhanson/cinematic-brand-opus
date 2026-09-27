import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import AdminFunnelBuilder from "@/pages/AdminFunnelBuilder";

export const Route = createFileRoute("/admin/funnel-builder")({
  head: adminHead("Funnel builder"),
  component: AdminFunnelBuilder,
});
