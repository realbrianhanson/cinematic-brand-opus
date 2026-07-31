import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import Blog from "@/pages/Blog";

export const Route = createFileRoute("/blog")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <Blog />
    </Suspense>
  ),
});
