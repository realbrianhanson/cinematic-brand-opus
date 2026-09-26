import { describe, expect, it } from "vitest";
import {
  experimentRequest,
  createExperimentHandler,
} from "../../../supabase/functions/_shared/offerExperiments";
import {
  applyExperimentCopy,
  experimentProgress,
  type OfferExperiment,
} from "../offerExperiments";
import { emptyBuilder } from "../offerBuilder";
import type { PublicOffer } from "../offers";
const offerId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const input = {
  action: "assign",
  offer_id: offerId,
  session_id: sessionId,
  session_token: "a".repeat(64),
};
describe("controlled offer experiments", () => {
  it("accepts only bounded session capability operations", () => {
    expect(experimentRequest(input)).not.toBeNull();
    for (const extra of [
      { email: "person@example.test" },
      { variant: "b" },
      { experiment_id: offerId },
      { action: "paid" },
      { session_token: "secret" },
      { offer_id: "bad" },
    ])
      expect(experimentRequest({ ...input, ...extra })).toBeNull();
    expect(
      experimentRequest({
        ...input,
        action: "expose",
        experiment_id: offerId,
        variant: "b",
      }),
    ).not.toBeNull();
  });
  it("changes presentation copy without mutating price, proof, or delivery", () => {
    const presentation = emptyBuilder().presentation;
    presentation.thankYou.firstStep = "Open your file";
    const offer = {
      id: offerId,
      amount_minor: 700,
      currency: "usd",
      presentation,
    } as PublicOffer;
    const output = applyExperimentCopy(offer, {
      headline: "New headline",
      subheadline: "New copy",
      ctaText: "Continue",
    });
    expect(output.amount_minor).toBe(700);
    expect(output.presentation?.thankYou).toEqual(presentation.thankYou);
    expect(offer.presentation?.landing.headline).toBe("");
  });
  it("requires both predeclared sample and duration and never claims a winner", () => {
    const e = {
      started_at: "2026-09-01T00:00:00Z",
      ended_at: null,
      minimum_days: 14,
      minimum_per_variant: 1000,
      results: [
        { variant: "a", sessions: 1000 },
        { variant: "b", sessions: 999 },
      ],
    } as OfferExperiment;
    expect(experimentProgress(e, Date.parse("2026-09-20")).readyForReview).toBe(
      false,
    );
    e.results[1].sessions = 1000;
    expect(experimentProgress(e, Date.parse("2026-09-05")).readyForReview).toBe(
      false,
    );
    expect(experimentProgress(e, Date.parse("2026-09-20")).readyForReview).toBe(
      true,
    );
    e.ended_at = "2026-09-05T00:00:00Z";
    expect(experimentProgress(e, Date.parse("2026-10-20")).readyForReview).toBe(
      false,
    );
  });
  it("does not accept cross-origin or authenticated traffic", async () => {
    let called = false;
    const handler = createExperimentHandler({
      origin: async () => "https://example.test",
      anonKey: "anon",
      limit: async () => true,
      decide: async () => {
        called = true;
        return null;
      },
    });
    for (const headers of [
      { origin: "https://other.test", apikey: "anon" },
      {
        origin: "https://example.test",
        apikey: "anon",
        authorization: "Bearer signed-in",
      },
    ]) {
      const response = await handler(
        new Request("https://edge.test", {
          method: "POST",
          headers: new Headers(
            Object.entries({
              "content-type": "application/json",
              ...headers,
            }).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ),
          body: JSON.stringify(input),
        }),
      );
      expect(await response.json()).toEqual({ decision: null });
    }
    expect(called).toBe(false);
  });
});
