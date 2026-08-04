import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import ContentTypeList from "@/pages/ContentTypeList";

export const Route = createFileRoute("/resources/$contentType/")({
  component: () => (
    <Suspense fallback={<PublicPageSkeleton />}>
      <ContentTypeList />
    </Suspense>
  ),
});
