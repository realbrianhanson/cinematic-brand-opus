import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import GeneratedPage from "@/pages/GeneratedPage";

export const Route = createFileRoute("/resources/$contentType/$pageSlug")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <GeneratedPage />
    </Suspense>
  ),
});
