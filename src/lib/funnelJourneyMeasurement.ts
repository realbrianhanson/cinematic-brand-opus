import {
  parseFunnelMeasurement,
  type FunnelMeasurementEvent,
} from "../../supabase/functions/_shared/funnelJourneyMeasurement";
import {
  measurementAllowed,
  queueSupplementalMeasurement,
} from "./measurement";
export type { FunnelMeasurementType } from "../../supabase/functions/_shared/funnelJourneyMeasurement";
export type FunnelMeasurementInput = Omit<FunnelMeasurementEvent, "id">;

/** Bounded, best-effort observations. Caller never awaits analytics before navigating. */
export function recordFunnelJourneyMeasurement(
  inputs: FunnelMeasurementInput[],
): void {
  try {
    if (!measurementAllowed() || !inputs.length) return;
    const events = inputs
      .slice(0, 10)
      .map((input) => ({ ...input, id: crypto.randomUUID() }));
    queueSupplementalMeasurement(async (context, current) => {
      const body = { action: "record", consent: true, ...context, events };
      if (!parseFunnelMeasurement(body)) return false;
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!base || !key) return false;
      // One retry, with unchanged IDs and payload. Revocation generation controls
      // queue entry; recheck current consent immediately before either network call.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!current()) return false;
        try {
          const response = await fetch(
            `${base.replace(/\/$/, "")}/functions/v1/funnel-journey-measurement`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: key },
              body: JSON.stringify(body),
              credentials: "omit",
              keepalive: true,
              signal: AbortSignal.timeout(2500),
            },
          );
          if (response.ok) return (await response.json()).accepted === true;
          if (response.status < 500) return false;
        } catch {
          /* A retry remains optional and uses the original IDs. */
        }
      }
      return false;
    });
  } catch {
    /* Optional measurement must never interrupt functional navigation. */
  }
}
