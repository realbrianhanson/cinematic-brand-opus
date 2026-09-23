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
        }
      : null,
    history: (historyResult.data ?? []).map((revision) => ({
      ...revision,
      document: readDocument(revision.document),
    })),
  };
}

/** Reuse requestId with the identical input after an uncertain network failure. */
export async function saveOfferBuilder(
  input: OfferBuilderSaveInput,
): Promise<OfferBuilderSaveResult> {
  offerBuilderSchema.parse(input.document.builder);
  const { data, error } = await supabase
    .rpc("offer_builder_save", {
      _offer_id: input.offerId,
      _document: input.document as unknown as Json,
      _expected_offer_updated_at: input.expectedOfferUpdatedAt,
      _expected_draft_version: input.expectedDraftVersion,
      _publish: input.publish,
      _request_id: input.requestId,
    })
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
