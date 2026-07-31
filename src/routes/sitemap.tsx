import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import HTMLSitemap from "@/pages/HTMLSitemap";

export const Route = createFileRoute("/sitemap")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <HTMLSitemap />
    </Suspense>
  ),
});
