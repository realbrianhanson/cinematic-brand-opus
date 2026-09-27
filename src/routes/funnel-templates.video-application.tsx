import { createFileRoute } from "@tanstack/react-router";
import CallFunnelTemplate from "@/pages/CallFunnelTemplate";
export const Route = createFileRoute("/funnel-templates/video-application")({
  head: () => ({
    meta: [
      { title: "Video + Application template" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CallFunnelTemplate,
});
