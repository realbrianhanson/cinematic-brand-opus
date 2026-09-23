import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import AdminLogin from "@/components/admin/AdminLogin";
import { adminHead } from "@/lib/adminHead";

export const Route = createFileRoute("/admin_/login")({
  head: adminHead("Sign in"),
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <AdminLogin />
    </Suspense>
  ),
});
