import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import OfferShell from "@/components/OfferShell";
import OfferLanding from "@/pages/OfferLanding";
import { invokeOfferApi, type PublicOffer } from "@/lib/offers";

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
    invokeOfferApi<{ offer: PublicOffer | null }>({
      action: "preview",
      offer_id: id,
    })
      .then((result) => {
        if (active) {
          setOffer(result.offer);
          if (!result.offer) setError("Offer not found.");
        }
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
