import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import AccountSecurity from "@/components/admin/AccountSecurity";

export const Route = createFileRoute("/admin/settings")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <AccountSecurity />
    </Suspense>
  ),
});
