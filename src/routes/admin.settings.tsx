import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import ChangePassword from "@/components/admin/ChangePassword";

export const Route = createFileRoute("/admin/settings")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ChangePassword />
    </Suspense>
  ),
});
