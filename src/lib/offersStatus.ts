import { supabase } from "@/integrations/supabase/client";

export type OfferStatus = "draft" | "published" | "archived";
export type OfferStatusChange = "unpublish" | "archive" | "restore";
export type OfferStatusRow = { id: string; status: string; updated_at: string };

/** Target status for each list/editor action. Publishing stays in the builder. */
export const statusChangeTarget: Record<OfferStatusChange, OfferStatus> = {
  unpublish: "draft",
  archive: "archived",
  restore: "draft",
};

/** Actions offered for an offer's current public status. */
export function statusChanges(status: string): OfferStatusChange[] {
  if (status === "published") return ["unpublish", "archive"];
  if (status === "archived") return ["restore"];
  return ["archive"];
}

export const statusChangeCopy: Record<
  OfferStatusChange,
  {
    button: string;
    title: string;
    detail: string;
    confirm: string;
    done: string;
  }
> = {
  unpublish: {
    button: "Unpublish",
    title: "Unpublish this offer?",
    detail:
      "The public page and Shop listing stop working immediately and new visitors can no longer claim or buy it. Existing customers keep their access links. If another offer uses this one as its follow-up, the follow-up stops appearing. Your pages, price and saved draft are kept, so you can publish again later.",
    confirm: "Unpublish offer",
    done: "Offer unpublished. It is now a private draft.",
  },
  archive: {
    button: "Archive",
    title: "Archive this offer?",
    detail:
      "Archived offers are hidden from visitors and the Shop, and new claims or purchases stop. Existing customers keep their access links, and it stops appearing as another offer's follow-up. Nothing is deleted, and you can restore it to a draft later.",
    confirm: "Archive offer",
    done: "Offer archived. Visitors can no longer open or claim it.",
  },
  restore: {
    button: "Restore to draft",
    title: "Restore this offer to a draft?",
    detail:
      "The offer returns to your drafts and stays private. Publish it from the offer builder when it is ready.",
    confirm: "Restore to draft",
    done: "Offer restored to a private draft.",
  },
};

/**
 * Changes only offers.status through the admin's normal row access, guarded by
 * the updated_at the admin last saw so a concurrent edit is never overwritten.
 */
export async function changeOfferStatus(
  offer: Pick<OfferStatusRow, "id" | "updated_at">,
  change: OfferStatusChange,
): Promise<OfferStatusRow> {
  const { data, error } = await supabase
    .from("offers")
    .update({ status: statusChangeTarget[change] })
    .eq("id", offer.id)
    .eq("updated_at", offer.updated_at)
    .select("id,status,updated_at")
    .abortSignal(AbortSignal.timeout(20000))
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "This offer changed in another tab or by another admin. Refresh to see the latest version, then try again.",
    );
  return data;
}
