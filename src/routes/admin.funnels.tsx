import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import AdminFunnels from "@/pages/AdminFunnels";
export const Route = createFileRoute("/admin/funnels")({
  head: adminHead("Custom branching funnels"),
  component: AdminFunnels,
});
