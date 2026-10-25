import {
  draftPayload,
  empty,
  formIssues,
  slugify,
} from "@/components/admin/offerEditorState";
import { offerBuilderSchema, pageRecipe } from "./offerBuilder";
import type { OfferBuilderDocument } from "./offerBuilderClient";
import { offerStarterDefaults } from "./offerStarters";

export const connectedOfferRelations = ["bump", "upsell", "downsell"] as const;
export type ConnectedOfferRelation = (typeof connectedOfferRelations)[number];
export type ConnectedOfferFields = {
  title: string;
  summary: string;
  kind: "free" | "paid";
  price: string;
};

export const connectedOfferLabels: Record<ConnectedOfferRelation, string> = {
  bump: "order bump",
  upsell: "upsell",
  downsell: "downsell",
};

/** Create only a private draft from the facts entered by its administrator. */
export function connectedOfferDocument(
  relation: ConnectedOfferRelation,
  currency: string,
  fields: ConnectedOfferFields,
): OfferBuilderDocument {
  if (!connectedOfferRelations.includes(relation))
    throw new Error("Choose an order bump, upsell or downsell.");
  if (!["usd", "cad", "eur", "gbp", "aud"].includes(currency))
    throw new Error("Choose a supported currency on the original offer first.");
  const starter = offerStarterDefaults("upsell");
  const form = {
    ...empty,
    ...starter.form,
    ...fields,
    title: fields.title.trim(),
    summary: fields.summary.trim(),
    slug: slugify(fields.title),
    kind: relation === "bump" ? ("paid" as const) : fields.kind,
    currency,
    funnelOnly: true,
    showInShop: false,
  };
  if (!form.summary)
    throw new Error("Describe what this offer will help the customer do.");
  const draft = draftPayload(form);
  const issue = [...formIssues(form), ...draft.issues][0];
  if (issue) throw new Error(issue.message);
  const builder = starter.builder;
  builder.strategy.outcome = form.summary;
  const context = {
    strategy: builder.strategy,
    offer: {
      title: form.title,
      summary: form.summary,
      kind: form.kind,
      checkout_mode: "native" as const,
    },
  };
  builder.presentation.landing = pageRecipe("upsell", context);
  builder.presentation.upsell = pageRecipe("upsell", context);
  return { offer: draft.values, builder: offerBuilderSchema.parse(builder) };
}

/** Only definite SQL rejections unlock edits; an unknown response must retry identically. */
export function connectedOfferSaveRejected(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501|28000)$/.test(error.code)
  );
}
