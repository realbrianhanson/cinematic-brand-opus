import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import GeneratedPagesManager from "@/components/admin/GeneratedPagesManager";

export const Route = createFileRoute("/admin/pages")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <GeneratedPagesManager />
    </Suspense>
  ),
});
