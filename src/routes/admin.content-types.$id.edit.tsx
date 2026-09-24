import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import ContentTypeEditor from "@/components/admin/ContentTypeEditor";

export const Route = createFileRoute("/admin/content-types/$id/edit")({
  head: adminHead("Edit content format"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ContentTypeEditor />
    </Suspense>
  ),
});
