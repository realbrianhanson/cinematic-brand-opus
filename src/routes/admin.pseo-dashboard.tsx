import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PseoDashboard from "@/components/admin/PseoDashboard";

export const Route = createFileRoute("/admin/pseo-dashboard")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PseoDashboard />
    </Suspense>
  ),
});
