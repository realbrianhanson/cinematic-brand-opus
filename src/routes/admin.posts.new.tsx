import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PostEditor from "@/components/admin/PostEditor";

export const Route = createFileRoute("/admin/posts/new")({
  head: adminHead("New article"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PostEditor />
    </Suspense>
  ),
});
