import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  offerBuilderSchema,
  type OfferBuilder,
  type OfferProof,
} from "@/lib/offerBuilder";

type OfferRow = Database["public"]["Tables"]["offers"]["Row"];
export type OfferBuilderOffer = Partial<
  Omit<OfferRow, "id" | "created_at" | "updated_at" | "presentation">
>;
export type OfferBuilderDocument = {
  offer: OfferBuilderOffer;
  builder: OfferBuilder;
};
export type OfferBuilderDraft = {
  offer_id: string;
  document: OfferBuilderDocument;
  version: number;
  updated_at: string;
  base_offer_updated_at: string;
  /** The live offer this draft was saved against, when it is known. */
  base_offer?: Partial<OfferRow> | null;
};
export type OfferBuilderRevision = {
  id: string;
  document: OfferBuilderDocument;
  version: number;
  published: boolean;
  created_at: string;
};
export type OfferBuilderLoadResult = {
  draft: OfferBuilderDraft | null;
  history: OfferBuilderRevision[];
};
export type OfferBuilderSaveInput = {
  offerId: string;
  document: OfferBuilderDocument;
  expectedOfferUpdatedAt: string | null;
  expectedDraftVersion: number | null;
  publish: boolean;
  requestId: string;
};
export type OfferBuilderSaveResult = {
  offer: OfferRow;
  draft: OfferBuilderDraft;
  revision_id: string;
  published: boolean;
};
type GeneratedSaveArgs =
  Database["public"]["Functions"]["offer_builder_save"]["Args"];
type SaveArgs = Omit<
  GeneratedSaveArgs,
  "_expected_offer_updated_at" | "_expected_draft_version"
> & {
  _expected_offer_updated_at: string | null;
  _expected_draft_version: number | null;
};

function readDocument(value: Json): OfferBuilderDocument {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !value.offer ||
    typeof value.offer !== "object" ||
    Array.isArray(value.offer)
  ) {
    throw new Error("This saved offer document could not be read.");
  }
  return {
    offer: value.offer as OfferBuilderOffer,
    builder: offerBuilderSchema.parse(value.builder),
  };
}

export async function loadOfferBuilder(
  offerId: string,
): Promise<OfferBuilderLoadResult> {
  const [draftResult, historyResult] = await Promise.all([
    supabase
      .from("offer_builder_drafts")
      .select("offer_id,document,version,updated_at,base_offer_updated_at")
      .eq("offer_id", offerId)
      .abortSignal(AbortSignal.timeout(15000))
      .maybeSingle(),
    supabase
      .from("offer_builder_revisions")
      .select("id,document,version,published,created_at")
      .eq("offer_id", offerId)
      .order("version", { ascending: false })
      .limit(30)
      .abortSignal(AbortSignal.timeout(15000)),
  ]);
  if (draftResult.error) throw draftResult.error;
  if (historyResult.error) throw historyResult.error;
  return {
    draft: draftResult.data
      ? {
          ...draftResult.data,
          document: readDocument(draftResult.data.document),
          base_offer: await loadDraftBase(offerId, draftResult.data.version),
        }
      : null,
    history: (historyResult.data ?? []).map((revision) => ({
      ...revision,
      document: readDocument(revision.document),
    })),
  };
}

/**
 * The saved revision that produced the current draft records the live offer
 * at that moment. Comparing it with today's offer tells a status-only change
 * (unpublish, archive) apart from a real content change made elsewhere.
 */
async function loadDraftBase(
  offerId: string,
  version: number,
): Promise<Partial<OfferRow> | null> {
  const { data, error } = await supabase
    .from("offer_builder_revisions")
    .select("offer:result->offer")
    .eq("offer_id", offerId)
    .eq("version", version)
    .abortSignal(AbortSignal.timeout(15000))
    .maybeSingle();
  if (error) throw error;
  const offer: unknown = data?.offer;
  return offer && typeof offer === "object" && !Array.isArray(offer)
    ? (offer as Partial<OfferRow>)
    : null;
}

/**
 * IDs of offers whose latest saved draft was not published. Reads the admin
 * draft and revision tables, which administrators can already select.
 */
export async function listUnpublishedDraftIds(
  offerIds: string[],
): Promise<Set<string>> {
  if (!offerIds.length) return new Set();
  const drafts = await supabase
    .from("offer_builder_drafts")
    .select("offer_id,version")
    .in("offer_id", offerIds)
    .abortSignal(AbortSignal.timeout(15000));
  if (drafts.error) throw drafts.error;
  const rows = drafts.data ?? [];
  if (!rows.length) return new Set();
  const revisions = await supabase
    .from("offer_builder_revisions")
    .select("offer_id,version,published")
    .in(
      "offer_id",
      rows.map((row) => row.offer_id),
    )
    .in("version", [...new Set(rows.map((row) => row.version))])
    .abortSignal(AbortSignal.timeout(15000));
  if (revisions.error) throw revisions.error;
  const published = new Set(
    (revisions.data ?? [])
      .filter((revision) => revision.published)
      .map((revision) => `${revision.offer_id}:${revision.version}`),
  );
  return new Set(
    rows
      .filter((row) => !published.has(`${row.offer_id}:${row.version}`))
      .map((row) => row.offer_id),
  );
}

/** Reuse requestId with the identical input after an uncertain network failure. */
export async function saveOfferBuilder(
  input: OfferBuilderSaveInput,
): Promise<OfferBuilderSaveResult> {
  offerBuilderSchema.parse(input.document.builder);
  const args: SaveArgs = {
    _offer_id: input.offerId,
    _document: input.document as unknown as Json,
    _expected_offer_updated_at: input.expectedOfferUpdatedAt,
    _expected_draft_version: input.expectedDraftVersion,
    _publish: input.publish,
    _request_id: input.requestId,
  };
  // Postgres RPC argument metadata omits nullability. The save function requires
  // actual null tokens for new offers/drafts; keep this override at its boundary.
  const { data, error } = await supabase
    .rpc("offer_builder_save", args as GeneratedSaveArgs)
    .abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !data.offer ||
    !data.draft
  )
    throw new Error("The offer save returned an invalid response.");
  const result = data as unknown as OfferBuilderSaveResult;
  result.draft.document = readDocument(
    result.draft.document as unknown as Json,
  );
  return result;
}

export async function listOfferProof(): Promise<OfferProof[]> {
  const { data, error } = await supabase
    .from("offer_proof_items")
    .select(
      "id,title,kind,content,attribution,source_url,notes,approved,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(200)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  return (data ?? []) as OfferProof[];
}
export async function saveOfferProof(
  input: Omit<OfferProof, "id" | "created_at" | "updated_at"> & { id?: string },
): Promise<OfferProof> {
  const { id, ...fields } = input;
  const operation = id
    ? supabase.from("offer_proof_items").update(fields).eq("id", id)
    : supabase.from("offer_proof_items").insert(fields);
  const { data, error } = await operation
    .select()
    .abortSignal(AbortSignal.timeout(15000))
    .single();
  if (error) throw error;
  return data as OfferProof;
}
export async function deleteOfferProof(id: string): Promise<void> {
  const { error } = await supabase
    .from("offer_proof_items")
    .delete()
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
}
