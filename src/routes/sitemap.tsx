import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import HTMLSitemap from "@/pages/HTMLSitemap";
import { sitemapHead } from "@/lib/sitemapHead";

export const Route = createFileRoute("/sitemap")({
  head: sitemapHead,
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <HTMLSitemap />
    </Suspense>
  ),
});
