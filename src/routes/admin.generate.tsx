import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import GenerationControls from "@/components/admin/GenerationControls";

export const Route = createFileRoute("/admin/generate")({
  head: adminHead("Generate drafts"),
  component: () => (
    <Suspense fallback={<AdminPageSkeleton />}>
      <GenerationControls />
    </Suspense>
  ),
});
