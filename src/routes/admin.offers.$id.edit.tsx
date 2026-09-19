import { createFileRoute } from "@tanstack/react-router";
import OfferEditor from "@/components/admin/OfferEditor";

export const Route = createFileRoute("/admin/offers/$id/edit")({
  component: EditorRoute,
});
function EditorRoute() {
  const { id } = Route.useParams();
  return <OfferEditor key={id} id={id} />;
}
