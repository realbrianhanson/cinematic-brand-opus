import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import ResourcesIndex from "@/pages/ResourcesIndex";

export const Route = createFileRoute("/resources/")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <ResourcesIndex />
    </Suspense>
  ),
});
