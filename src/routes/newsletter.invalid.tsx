import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import NewsletterStatus from "@/pages/NewsletterStatus";

export const Route = createFileRoute("/newsletter/invalid")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <NewsletterStatus />
    </Suspense>
  ),
});
