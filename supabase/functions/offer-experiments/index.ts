import { createExperimentHandler } from "../_shared/offerExperiments.ts";
import { offerAdminClient, offerOrigin } from "../_shared/offersRuntime.ts";
const admin = offerAdminClient();
Deno.serve(
  createExperimentHandler({
    anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    origin: () => offerOrigin(admin),
    limit: async (key) => {
      const { data, error } = await admin.rpc("newsletter_rate_limit_hit", {
        _key: key,
        _limit: 120,
        _window_seconds: 3600,
      });
      return !error && data === true;
    },
    decide: async (input) => {
      const { data, error } = await admin.rpc("offer_experiment_decide", {
        _offer_id: input.offerId,
        _session_id: input.sessionId,
        _token_hash: input.tokenHash,
        _expose_id: input.experimentId ?? null,
        _variant: input.variant ?? null,
      });
      if (error) throw new Error("Experiment unavailable");
      return data;
    },
  }),
);
