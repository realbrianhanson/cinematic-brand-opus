import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import News from "@/pages/News";

export const Route = createFileRoute("/news")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <News />
    </Suspense>
  ),
});
