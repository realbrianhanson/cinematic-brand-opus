import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PseoDashboard from "@/components/admin/PseoDashboard";

export const Route = createFileRoute("/admin/pseo-dashboard")({
  head: adminHead("Search performance"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PseoDashboard />
    </Suspense>
  ),
});
