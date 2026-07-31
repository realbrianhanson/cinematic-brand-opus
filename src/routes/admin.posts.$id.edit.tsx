import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PostEditor from "@/components/admin/PostEditor";

export const Route = createFileRoute("/admin/posts/$id/edit")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PostEditor />
    </Suspense>
  ),
});
