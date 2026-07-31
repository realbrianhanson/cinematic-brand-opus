import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import BlogPost from "@/pages/BlogPost";

export const Route = createFileRoute("/blog/$slug")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <BlogPost />
    </Suspense>
  ),
});
