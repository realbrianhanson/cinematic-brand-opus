import { createFileRoute } from "@tanstack/react-router";
import { getCallPublication } from "@/lib/callFunnelsClient";
import CallFunnelPage from "@/pages/CallFunnelPage";
export const Route = createFileRoute("/calls/$slug")({
  loader: ({ params }) => getCallPublication(params.slug),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Explore your next step" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CallRoute,
});
function CallRoute() {
  return <CallFunnelPage publication={Route.useLoaderData()} />;
}
