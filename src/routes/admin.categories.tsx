import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import CategoriesManager from "@/components/admin/CategoriesManager";

export const Route = createFileRoute("/admin/categories")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <CategoriesManager />
    </Suspense>
  ),
});
