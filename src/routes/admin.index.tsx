import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import Dashboard from "@/components/admin/Dashboard";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Dashboard />
    </Suspense>
  ),
});
