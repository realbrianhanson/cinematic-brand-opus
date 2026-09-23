import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import GeneratedPageEditor from "@/components/admin/GeneratedPageEditor";

export const Route = createFileRoute("/admin/pages/$id/edit")({
  head: adminHead("Edit resource"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <GeneratedPageEditor />
    </Suspense>
  ),
});
