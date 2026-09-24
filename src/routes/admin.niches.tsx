import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import NichesManager from "@/components/admin/NichesManager";

export const Route = createFileRoute("/admin/niches")({
  head: adminHead("Audiences & niches"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <NichesManager />
    </Suspense>
  ),
});
