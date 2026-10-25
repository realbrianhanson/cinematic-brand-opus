import { z } from "zod";
import type { OfferBuilderDocument } from "./offerBuilderClient";
import type { Database } from "@/integrations/supabase/types";

export type OfferConnection = "bump" | "upsell" | "downsell";
export type OfferParent = { id: string; relation: OfferConnection };
export type ConnectedOffer = {
  offer: Database["public"]["Tables"]["offers"]["Row"];
  document: OfferBuilderDocument | null;
};

/** Only known workspace destinations, never arbitrary return URLs. */
export function validateOfferWorkspaceSearch(search: Record<string, unknown>): {
  parent?: string;
  relation?: OfferConnection;
  view?: "connections";
} {
  const id = z.string().uuid().safeParse(search.parent);
  const relation = z
    .enum(["bump", "upsell", "downsell"])
    .safeParse(search.relation);
  return {
    ...(id.success && relation.success
      ? { parent: id.data, relation: relation.data }
      : {}),
    ...(search.view === "connections" ? { view: "connections" as const } : {}),
  };
}

/** Private drafts overlay shell rows for editing; published behavior stays live. */
export function connectedOfferView(item: ConnectedOffer) {
  const { offer, document } = item;
  return offer.status === "draft" && document
    ? {
        ...offer,
        ...document.offer,
        status: offer.status,
        presentation: document.builder.presentation,
      }
    : offer;
}
