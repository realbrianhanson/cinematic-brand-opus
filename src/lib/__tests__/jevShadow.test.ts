import { describe, expect, it } from "vitest";
import {
  AUDIENCE_FIT_LEVELS,
  buildJevRequest,
  decideVerdict,
  isPilotActive,
  MAX_RECENT_TITLES,
  MAX_STATE_CHARS,
  parseJevResponse,
} from "../../../supabase/functions/_shared/jevShadow";

const subject = {
  type: "opportunity" as const,
  id: "00000000-0000-0000-0000-000000000001",
  title: "Use AI to answer customer emails in half the time",
  targetKeyword: "AI customer email",
  topicLane: "customer-service",
  rationale: "New Gmail feature",
};

describe("buildJevRequest", () => {
  it("declares the four typed questions", () => {
    const req = buildJevRequest(subject, ["Old post"]);
    expect(Object.keys(req.questions).sort()).toEqual([
      "audience_fit",
      "duplicate",
      "relevant",
      "substance",
    ]);
    expect(req.questions.relevant.type).toBe("noul");
    expect(req.questions.audience_fit.type).toBe("score");
    expect(req.questions.audience_fit.criteria).toEqual(AUDIENCE_FIT_LEVELS);
    expect(req.state).toContain(subject.title);
    expect(req.state).toContain("- Old post");
  });

  it("bounds state size and the number of recent titles", () => {
    const titles = Array.from(
      { length: 500 },
      (_, i) => `Title ${i} ${"x".repeat(150)}`,
    );
    const req = buildJevRequest(
      { ...subject, rationale: "y".repeat(10000) },
      titles,
    );
    expect(req.state.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
    expect((req.state.match(/^- Title/gm) ?? []).length).toBeLessThanOrEqual(
      MAX_RECENT_TITLES,
    );
  });
});

describe("parseJevResponse", () => {
  it("reads noul probabilities and normalises the score to 0-100", () => {
    const parsed = parseJevResponse({
      model: "jev-1.13.0",
      answers: {
        relevant: { noul: 0.92 },
        duplicate: { noul: 0.1 },
        substance: { noul: 0.8 },
        audience_fit: { score: 3 },
      },
    });
    expect(parsed).toEqual({
      relevant_prob: 0.92,
      duplicate_prob: 0.1,
      substance_prob: 0.8,
      audience_fit_score: 75,
      verdict: "pursue",
    });
  });

  it("clamps out-of-range values and tolerates missing answers", () => {
    const parsed = parseJevResponse({
      answers: { relevant: { noul: 1.4 }, audience_fit: { score: 9 } },
    });
    expect(parsed.relevant_prob).toBe(1);
    expect(parsed.duplicate_prob).toBeNull();
    expect(parsed.audience_fit_score).toBe(100);
  });

  it("treats null answers as missing, not zero", () => {
    const parsed = parseJevResponse({
      answers: { relevant: { noul: null }, audience_fit: { score: null } },
    });
    expect(parsed.relevant_prob).toBeNull();
    expect(parsed.audience_fit_score).toBeNull();
  });

  it("returns an empty score for garbage", () => {
    expect(parseJevResponse(null).verdict).toBeNull();
    expect(parseJevResponse("oops").relevant_prob).toBeNull();
  });
});

describe("decideVerdict", () => {
  const base = {
    relevant_prob: 0.9,
    duplicate_prob: 0.1,
    substance_prob: 0.9,
    audience_fit_score: 80,
  };
  it("pursues clear candidates", () =>
    expect(decideVerdict(base)).toBe("pursue"));
  it("skips off-audience", () =>
    expect(decideVerdict({ ...base, relevant_prob: 0.2 })).toBe("skip"));
  it("skips likely duplicates", () =>
    expect(decideVerdict({ ...base, duplicate_prob: 0.8 })).toBe("skip"));
  it("skips thin material", () =>
    expect(decideVerdict({ ...base, substance_prob: 0.1 })).toBe("skip"));
  it("skips very low fit", () =>
    expect(decideVerdict({ ...base, audience_fit_score: 10 })).toBe("skip"));
  it("returns null with no signal", () =>
    expect(
      decideVerdict({
        relevant_prob: null,
        duplicate_prob: null,
        substance_prob: null,
        audience_fit_score: null,
      }),
    ).toBeNull());
});

describe("isPilotActive", () => {
  it("stops after the pilot end", () => {
    expect(isPilotActive(new Date("2026-09-27T23:59:00Z"))).toBe(true);
    expect(isPilotActive(new Date("2026-09-28T00:00:01Z"))).toBe(false);
  });
});
