import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import ContentQueue from "@/components/admin/ContentQueue";

export const Route = createFileRoute("/admin/queue")({
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ContentQueue />
    </Suspense>
  ),
});
