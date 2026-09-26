import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { emptyBuilder, readPresentation } from "./offerBuilder";
import type { PublicOffer } from "./offers";
import type { MeasurementContext } from "./measurement";

export const experimentCopySchema = z
  .object({
    headline: z.string().min(1).max(300),
    subheadline: z.string().max(1000),
    ctaText: z.string().min(1).max(80),
  })
  .strict();
export type ExperimentCopy = z.infer<typeof experimentCopySchema>;
const decisionSchema = z
  .object({
    experiment_id: z.string().uuid(),
    variant: z.enum(["a", "b"]),
    copy: experimentCopySchema,
    exposed: z.boolean(),
  })
  .strict();
export type ExperimentDecision = z.infer<typeof decisionSchema>;
const experimentSchema = z.object({
  id: z.string().uuid(),
  offer_id: z.string().uuid(),
  offer_title: z.string(),
  offer_slug: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  metric: z.enum(["free_claim", "paid_order"]),
  minimum_per_variant: z.number(),
  minimum_days: z.number(),
  state: z.enum(["draft", "running", "stopped"]),
  variant_a: experimentCopySchema,
  variant_b: experimentCopySchema,
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  end_reason: z.string().nullable(),
  created_at: z.string(),
  version: z.number(),
  results: z.array(
    z.object({
      variant: z.enum(["a", "b"]),
      sessions: z.number(),
      conversions: z.number(),
      test_payments: z.number(),
      refunded_sessions: z.number(),
    }),
  ),
});
export type OfferExperiment = z.infer<typeof experimentSchema>;
export async function loadOfferExperiments() {
  const { data, error } = await supabase.rpc("admin_offer_experiments");
  if (error) throw new Error("Experiments could not be loaded.");
  return z.array(experimentSchema).parse(data);
}
export function applyExperimentCopy(
  offer: PublicOffer,
  copy: ExperimentCopy,
): PublicOffer {
  const presentation =
    readPresentation(offer.presentation) ?? emptyBuilder().presentation;
  return {
    ...offer,
    presentation: {
      ...presentation,
      landing: { ...presentation.landing, ...copy },
    },
  };
}
export function experimentProgress(
  experiment: OfferExperiment,
  now = Date.now(),
) {
  const end = experiment.ended_at ? Date.parse(experiment.ended_at) : now;
  const days = experiment.started_at
    ? Math.max(0, (end - Date.parse(experiment.started_at)) / 86400000)
    : 0;
  const enough = ["a", "b"].every(
    (variant) =>
      (experiment.results.find((r) => r.variant === variant)?.sessions ?? 0) >=
      experiment.minimum_per_variant,
  );
  return { days, readyForReview: enough && days >= experiment.minimum_days };
}
export async function requestExperiment(
  offerId: string,
  context: MeasurementContext,
  signal: AbortSignal,
  decision?: ExperimentDecision,
) {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offer-experiments`,
    {
      method: "POST",
      credentials: "omit",
      signal,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        action: decision ? "expose" : "assign",
        offer_id: offerId,
        ...context,
        ...(decision
          ? { experiment_id: decision.experiment_id, variant: decision.variant }
          : {}),
      }),
    },
  );
  if (!response.ok) return null;
  const body: unknown = await response.json();
  const parsed = decisionSchema.safeParse(
    body && typeof body === "object" && "decision" in body
      ? body.decision
      : null,
  );
  return parsed.success ? parsed.data : null;
}
