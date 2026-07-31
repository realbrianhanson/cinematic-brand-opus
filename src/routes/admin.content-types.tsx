import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import ContentTypesManager from "@/components/admin/ContentTypesManager";

export const Route = createFileRoute("/admin/content-types")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ContentTypesManager />
    </Suspense>
  ),
});
