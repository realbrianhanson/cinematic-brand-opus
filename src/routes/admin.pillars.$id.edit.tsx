import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PillarPageEditor from "@/components/admin/PillarPageEditor";

export const Route = createFileRoute("/admin/pillars/$id/edit")({
  head: adminHead("Edit topic guide"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PillarPageEditor />
    </Suspense>
  ),
});
