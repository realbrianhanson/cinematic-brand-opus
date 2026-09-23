import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import SiteSettingsManager from "@/components/admin/SiteSettingsManager";

export const Route = createFileRoute("/admin/site-settings")({
  head: adminHead("Brand & publishing"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <SiteSettingsManager />
    </Suspense>
  ),
});
