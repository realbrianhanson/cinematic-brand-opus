import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OfferEditor from "@/components/admin/OfferEditor";

export const Route = createFileRoute("/admin/offers/$id/edit")({
  head: adminHead("Edit offer"),
  component: EditorRoute,
});
function EditorRoute() {
  const { id } = Route.useParams();
  return <OfferEditor key={id} id={id} />;
}
