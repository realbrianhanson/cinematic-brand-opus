import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PillarPagesManager from "@/components/admin/PillarPagesManager";

export const Route = createFileRoute("/admin/pillars/")({
  head: adminHead("Topic guides"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PillarPagesManager />
    </Suspense>
  ),
});
