import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import SiteSetup from "@/components/admin/SiteSetup";
export const Route = createFileRoute("/admin/setup")({
  head: adminHead("Site setup"),
  component: SiteSetup,
});
