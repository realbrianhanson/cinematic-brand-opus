import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import OfferShell from "@/components/OfferShell";
import OfferLanding from "@/pages/OfferLanding";
import { type PublicOffer } from "@/lib/offers";
import { supabase } from "@/integrations/supabase/client";
import { loadOfferBuilder } from "@/lib/offerBuilderClient";
import { readPresentation } from "@/lib/offerBuilder";

export const Route = createFileRoute("/offers/preview/$id")({
  head: () => ({
    meta: [
      { title: "Offer preview" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <Preview />
    </ProtectedRoute>
  ),
});
function Preview() {
  const { id } = Route.useParams();
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOffer(null);
    setError("");
    Promise.all([
      supabase
        .from("offers")
        .select("*")
        .eq("id", id)
        .abortSignal(AbortSignal.timeout(20000))
        .maybeSingle(),
      loadOfferBuilder(id),
    ])
      .then(([result, workspace]) => {
        if (!active) return;
        if (result.error) throw result.error;
        if (!result.data) {
          setError("Offer not found.");
          return;
        }
        const draft = workspace.draft?.document;
        setOffer({
          ...result.data,
          ...draft?.offer,
          presentation: readPresentation(
            draft?.builder.presentation || result.data.presentation,
          ),
        } as PublicOffer);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Preview could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (!offer)
    return (
      <OfferShell>
        <p role={error ? "alert" : "status"}>{error || "Loading preview…"}</p>
      </OfferShell>
    );
  return <OfferLanding key={offer.id} offer={offer} preview />;
}
