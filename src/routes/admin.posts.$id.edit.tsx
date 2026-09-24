import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import PostEditor from "@/components/admin/PostEditor";

export const Route = createFileRoute("/admin/posts/$id/edit")({
  head: adminHead("Edit article"),
  component: EditorRoute,
});
function EditorRoute() {
  const { id } = Route.useParams();
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PostEditor key={id} />
    </Suspense>
  );
}
