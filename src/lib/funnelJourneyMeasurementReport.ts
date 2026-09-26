import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
const count = z.number().int().nonnegative();
export const funnelJourneyMeasurementSchema = z.object({
  generated_at: z.string(),
  measurement_started_at: z.string(),
  range: z.object({
    start: z.string(),
    end: z.string(),
    timezone: z.literal("UTC"),
  }),
  revision_count: count,
  revisions: z.array(
    z.object({
      journey_id: z.string().uuid(),
      revision: z.number().int().positive(),
      slug: z.string(),
      title: z.string(),
      measured_sessions: count,
      entry_sessions: count,
      steps: z.array(
        z.object({
          step_id: z.string(),
          title: z.string(),
          kind: z.enum(["content", "choice", "offer", "provider", "end"]),
          view_sessions: count,
          continue_sessions: count,
          handoff_sessions: count,
          no_next_action_sessions: count,
          still_active_sessions: count,
          branches: z.array(
            z.object({
              option_id: z.string(),
              label: z.string(),
              next_step_id: z.string(),
              sessions: count,
            }),
          ),
        }),
      ),
    }),
  ),
});
export type FunnelJourneyMeasurementReport = z.infer<
  typeof funnelJourneyMeasurementSchema
>;
export const funnelJourneyMeasurementQuery = (days: 7 | 30 | 90) =>
  queryOptions({
    queryKey: ["funnel-journey-measurement", days],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_funnel_journey_measurement", { _days: days })
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(20000)]));
      if (error) throw new Error("Journey measurement could not be loaded.");
      return funnelJourneyMeasurementSchema.parse(data);
    },
    staleTime: 60000,
    retry: false,
  });
