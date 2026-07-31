import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import NewsDetail from "@/pages/NewsDetail";

export const Route = createFileRoute("/news/$id")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <NewsDetail />
    </Suspense>
  ),
});
