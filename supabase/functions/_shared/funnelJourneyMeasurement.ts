import {
  CONVERSION_UUID,
  conversionIdentity,
  conversionSlug,
} from "./conversion.ts";

const STEP = /^[a-z][a-z0-9-]{0,47}$/;
const SLUG = /^[a-z][a-z0-9-]{0,79}$/;
export type FunnelMeasurementType =
  "step_view" | "step_continue" | "offer_handoff" | "provider_handoff";
export interface FunnelMeasurementEvent {
  id: string;
  slug: string;
  revision: number;
  step_id: string;
  type: FunnelMeasurementType;
  option_id?: string;
}
const TYPES: FunnelMeasurementType[] = [
  "step_view",
  "step_continue",
  "offer_handoff",
  "provider_handoff",
];
export function parseFunnelMeasurement(value: unknown) {
  const identity = conversionIdentity(value);
  if (!identity || !value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    body.action !== "record" ||
    body.consent !== true ||
    !Array.isArray(body.events) ||
    body.events.length < 1 ||
    body.events.length > 10
  )
    return null;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "action",
          "consent",
          "session_id",
          "session_token",
          "events",
          "attribution",
        ].includes(key),
    )
  )
    return null;
  const events: FunnelMeasurementEvent[] = [];
  for (const input of body.events) {
    if (!input || typeof input !== "object") return null;
    const event = input as Record<string, unknown>;
    if (
      Object.keys(event).some(
        (key) =>
          !["id", "slug", "revision", "step_id", "type", "option_id"].includes(
            key,
          ),
      ) ||
      typeof event.id !== "string" ||
      !CONVERSION_UUID.test(event.id) ||
      typeof event.slug !== "string" ||
      !SLUG.test(event.slug) ||
      !Number.isSafeInteger(event.revision) ||
      Number(event.revision) < 1 ||
      Number(event.revision) > 2147483647 ||
      typeof event.step_id !== "string" ||
      !STEP.test(event.step_id) ||
      !TYPES.includes(event.type as FunnelMeasurementType)
    )
      return null;
    if (
      event.option_id !== undefined &&
      (event.type !== "step_continue" ||
        typeof event.option_id !== "string" ||
        !STEP.test(event.option_id))
    )
      return null;
    events.push({
      id: event.id.toLowerCase(),
      slug: event.slug,
      revision: Number(event.revision),
      step_id: event.step_id,
      type: event.type as FunnelMeasurementType,
      ...(event.option_id ? { option_id: String(event.option_id) } : {}),
    });
  }
  const attribution =
    body.attribution && typeof body.attribution === "object"
      ? (body.attribution as Record<string, unknown>)
      : {};
  return {
    ...identity,
    events,
    attribution: {
      source: conversionSlug(attribution.source, "direct"),
      medium: conversionSlug(attribution.medium, "none"),
      campaign: conversionSlug(attribution.campaign, "none"),
    },
  };
}
