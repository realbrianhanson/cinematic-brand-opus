import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import PillarPage from "@/pages/PillarPage";

export const Route = createFileRoute("/guides/$slug")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <PillarPage />
    </Suspense>
  ),
});
