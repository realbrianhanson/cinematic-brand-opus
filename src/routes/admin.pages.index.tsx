import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import GeneratedPagesManager from "@/components/admin/GeneratedPagesManager";

export const Route = createFileRoute("/admin/pages/")({
  head: adminHead("Resources"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <GeneratedPagesManager />
    </Suspense>
  ),
});
