import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import ContentQueue from "@/components/admin/ContentQueue";

export const Route = createFileRoute("/admin/queue")({
  head: adminHead("Queue & automation"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <ContentQueue />
    </Suspense>
  ),
});
