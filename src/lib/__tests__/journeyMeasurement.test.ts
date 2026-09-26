import { describe, expect, it } from "vitest";
import { parseConversionRequest } from "../../../supabase/functions/_shared/conversion";
const event = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "upsell_view",
  path: "/offer-access",
  offer_id: "22222222-2222-4222-8222-222222222222",
  parent_offer_id: "33333333-3333-4333-8333-333333333333",
};
const request = (value: object) => ({
  action: "record",
  consent: true,
  session_id: "44444444-4444-4444-8444-444444444444",
  session_token: "a".repeat(64),
  events: [value],
});
describe("optional follow-up measurement", () => {
  it("accepts only bounded offer identities and fixed step actions", () => {
    for (const type of ["upsell_view", "upsell_accept", "upsell_decline"])
      expect(
        parseConversionRequest(request({ ...event, type }))?.events[0],
      ).toEqual({ ...event, type });
  });
  it("rejects private link fragments, incomplete relationships and ordinary views on private access routes", () => {
    for (const invalid of [
      { ...event, path: "/offer-access#token=secret" },
      { ...event, path: "/offer-access?recover=1" },
      { ...event, parent_offer_id: undefined },
      { ...event, parent_offer_id: event.offer_id },
      { ...event, type: "page_view", parent_offer_id: undefined },
      { ...event, path: "/offers/example" },
      { ...event, destination: "external_offer" },
    ])
      expect(parseConversionRequest(request(invalid))).toBeNull();
  });
});
