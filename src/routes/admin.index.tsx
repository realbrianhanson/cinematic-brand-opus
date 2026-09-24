import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import Dashboard from "@/components/admin/Dashboard";

export const Route = createFileRoute("/admin/")({
  head: adminHead("Overview"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Dashboard />
    </Suspense>
  ),
});
