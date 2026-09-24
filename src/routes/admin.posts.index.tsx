import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PostsManager from "@/components/admin/PostsManager";

export const Route = createFileRoute("/admin/posts/")({
  head: adminHead("Articles"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PostsManager />
    </Suspense>
  ),
});
