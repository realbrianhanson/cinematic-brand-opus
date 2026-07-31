import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import WidgetsManager from "@/components/admin/WidgetsManager";

export const Route = createFileRoute("/admin/widgets")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <WidgetsManager />
    </Suspense>
  ),
});
