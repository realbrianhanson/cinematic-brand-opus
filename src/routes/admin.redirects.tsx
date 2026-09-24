import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import RedirectsManager from "@/components/admin/RedirectsManager";

export const Route = createFileRoute("/admin/redirects")({
  head: adminHead("Redirects"),
  component: RedirectsManager,
});
