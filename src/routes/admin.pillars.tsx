import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PillarPagesManager from "@/components/admin/PillarPagesManager";

export const Route = createFileRoute("/admin/pillars")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PillarPagesManager />
    </Suspense>
  ),
});
