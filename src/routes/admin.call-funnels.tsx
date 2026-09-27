import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import AdminCallFunnels from "@/pages/AdminCallFunnels";
export const Route = createFileRoute("/admin/call-funnels")({
  head: adminHead("Call funnel builder"),
  component: AdminCallFunnels,
});
