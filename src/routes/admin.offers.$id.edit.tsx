import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OfferEditor from "@/components/admin/OfferEditor";
import { validateOfferWorkspaceSearch } from "@/lib/offerWorkspace";

export const Route = createFileRoute("/admin/offers/$id/edit")({
  head: adminHead("Edit offer"),
  validateSearch: validateOfferWorkspaceSearch,
  component: EditorRoute,
});
function EditorRoute() {
  const { id } = Route.useParams();
  const { parent, relation, view } = Route.useSearch();
  return (
    <OfferEditor
      key={id}
      id={id}
      parent={
        parent && relation && parent !== id
          ? { id: parent, relation }
          : undefined
      }
      initialStep={view === "connections" ? "next" : undefined}
    />
  );
}
