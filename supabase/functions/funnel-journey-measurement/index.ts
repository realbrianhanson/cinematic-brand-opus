import { createFunnelMeasurementCollector } from "../_shared/funnelJourneyMeasurementCollector.ts";
import { offerAdminClient, offerOrigin } from "../_shared/offersRuntime.ts";
const admin = offerAdminClient();
Deno.serve(
  createFunnelMeasurementCollector({
    anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    origin: () => offerOrigin(admin),
    rateLimit: async (key, limit, seconds) => {
      const { data, error } = await admin.rpc("newsletter_rate_limit_hit", {
        _key: key,
        _limit: limit,
        _window_seconds: seconds,
      });
      return !error && data === true;
    },
    record: async ({ sessionId, tokenHash, events, attribution }) => {
      const { data, error } = await admin.rpc(
        "funnel_journey_record_measurement",
        {
          _session_id: sessionId,
          _token_hash: tokenHash,
          _events: events,
          _attribution: attribution,
          _consent: true,
        },
      );
      if (error) throw new Error("Measurement unavailable");
      return data === true;
    },
  }),
);
