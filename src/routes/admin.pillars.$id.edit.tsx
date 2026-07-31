import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PillarPageEditor from "@/components/admin/PillarPageEditor";

export const Route = createFileRoute("/admin/pillars/$id/edit")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PillarPageEditor />
    </Suspense>
  ),
});
