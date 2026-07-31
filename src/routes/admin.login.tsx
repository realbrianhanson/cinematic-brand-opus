import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import AdminLogin from "@/components/admin/AdminLogin";

export const Route = createFileRoute("/admin/login")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <AdminLogin />
    </Suspense>
  ),
});
