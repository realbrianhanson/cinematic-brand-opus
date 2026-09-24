import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import CategoriesManager from "@/components/admin/CategoriesManager";

export const Route = createFileRoute("/admin/categories")({
  head: adminHead("Categories"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <CategoriesManager />
    </Suspense>
  ),
});
