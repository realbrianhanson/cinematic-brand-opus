import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import AccountSecurity from "@/components/admin/AccountSecurity";

export const Route = createFileRoute("/admin/settings")({
  head: adminHead("Account security"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <AccountSecurity />
    </Suspense>
  ),
});
