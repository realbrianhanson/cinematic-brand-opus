import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import ResetPassword from "@/components/admin/ResetPassword";

// Outside the /admin guard: a recovery session is not yet a verified admin.
export const Route = createFileRoute("/admin_/reset-password")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <ResetPassword />
    </Suspense>
  ),
});
