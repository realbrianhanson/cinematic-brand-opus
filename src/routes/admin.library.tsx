import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import MediaLibrary from "@/components/admin/MediaLibrary";

export const Route = createFileRoute("/admin/library")({
  head: adminHead("Media library"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <MediaLibrary />
    </Suspense>
  ),
});
