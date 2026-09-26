import { createFileRoute } from "@tanstack/react-router";
import { funnelInitialProject } from "@/lib/funnelJourneys";
import FunnelJourney from "@/pages/FunnelJourney";
export const Route = createFileRoute("/funnels/$slug")({
  validateSearch: (raw: Record<string, unknown>) => ({
    project: funnelInitialProject(raw.project),
  }),
  head: () => ({
    meta: [
      { title: "Choose your next step" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JourneyRoute,
});
function JourneyRoute() {
  const { slug } = Route.useParams();
  const { project } = Route.useSearch();
  return <FunnelJourney slug={slug} initialProject={project} />;
}
