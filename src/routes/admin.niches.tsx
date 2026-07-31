import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import NichesManager from "@/components/admin/NichesManager";

export const Route = createFileRoute("/admin/niches")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <NichesManager />
    </Suspense>
  ),
});
