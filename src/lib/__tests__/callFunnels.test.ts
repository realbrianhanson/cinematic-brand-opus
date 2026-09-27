import { describe, expect, it } from "vitest";
import {
  emptyCallFunnelConfig,
  callConfigIssues,
  parseCallConfig,
  publicCallConfig,
  evaluateCallApplication,
  cleanCallAnswers,
  emptyCallPreparationExtras,
} from "@/lib/callFunnels";

describe("versioned call funnel contract", () => {
  it("keeps legacy preparation valid and strictly validates optional modules", () => {
    const c = emptyCallFunnelConfig();
    delete c.preparation.extras;
    expect(callConfigIssues(c)).toEqual([]);
    expect(publicCallConfig(c).preparation).not.toHaveProperty("extras");
    c.preparation.extras = emptyCallPreparationExtras();
    c.booking.url = "https://example.com/calendar";
    c.alternative.url = "/shop";
    expect(callConfigIssues(c, true)).toEqual([]);
    c.preparation.extras.overview.enabled = true;
    expect(callConfigIssues(c, true).join(" ")).toMatch(/overview.*HTTPS/);
    c.preparation.extras.overview.url = "http://example.com/offer.pdf";
    expect(callConfigIssues(c).join(" ")).toMatch(/HTTPS/);
    c.preparation.extras.overview.url = "https://example.com/offer.pdf";
    c.preparation.extras.objections =
      emptyCallFunnelConfig().preparation.extras!.objections;
    expect(callConfigIssues(c, true)).toEqual([]);
    c.preparation.extras.objections.items[0].answer = "";
    expect(callConfigIssues(c, true).join(" ")).toMatch(/Preparation answer/);
    c.preparation.extras.objections.items[0].enabled = false;
    expect(callConfigIssues(c, true)).toEqual([]);
    c.preparation.extras.objections.items[0].captions = "javascript:alert(1)";
    expect(callConfigIssues(c).join(" ")).toMatch(/captions/);
    expect(
      callConfigIssues({
        ...c,
        preparation: { ...c.preparation, extras: null },
      }).join(" "),
    ).toMatch(/extras/);
  });
  it("keeps source notes private and restricts source keys", () => {
    const c = emptyCallFunnelConfig();
    c.scripts.inspirationSource = "acquisition";
    c.scripts.inspirationPattern = "Private pattern";
    c.scripts.experimentNote = "Private measurement";
    expect(callConfigIssues(c)).toEqual([]);
    expect(JSON.stringify(publicCallConfig(c))).not.toContain(
      "Private pattern",
    );
    c.scripts.inspirationSource = "arbitrary";
    expect(callConfigIssues(c).join(" ")).toMatch(/Inspiration source/);
  });
  it("starts dark and prevents publishing incomplete destinations", () => {
    const config = emptyCallFunnelConfig();
    expect(config.theme.mode).toBe("dark");
    expect(callConfigIssues(config)).toEqual([]);
    expect(callConfigIssues(config, true).join(" ")).toMatch(/calendar/);
    config.brand.name = "Example";
    config.booking.url = "https://example.com/calendar";
    config.alternative.url = "/shop";
    expect(callConfigIssues(config, true)).toEqual([]);
  });
  it("keeps scripts and routing rules out of public content", () => {
    const config = emptyCallFunnelConfig();
    config.scripts.buyer = "Private sales strategy";
    const value = publicCallConfig(config);
    expect(value).not.toHaveProperty("scripts");
    expect(value).not.toHaveProperty("qualificationRules");
    expect(JSON.stringify(value)).not.toContain("Private sales strategy");
  });
  it("rejects coerced enums and text PostgreSQL cannot store", () => {
    const c = emptyCallFunnelConfig();
    for (const theme of [
      { ...c.theme, mode: ["dark"] },
      { ...c.theme, font: ["sans"] },
    ])
      expect(callConfigIssues({ ...c, theme }).length).toBeGreaterThan(0);
    expect(
      callConfigIssues({
        ...c,
        questions: [{ ...c.questions[1], type: ["text"], options: [] }],
      }).length,
    ).toBeGreaterThan(0);
    expect(
      callConfigIssues({
        ...c,
        brand: { ...c.brand, name: "Bad" + String.fromCharCode(0) },
      }).length,
    ).toBeGreaterThan(0);
  });
  it("rejects malformed nested contracts without crashing validation", () => {
    for (const key of Object.keys(emptyCallFunnelConfig())) {
      const config = { ...emptyCallFunnelConfig(), [key]: null };
      expect(callConfigIssues(config).length).toBeGreaterThan(0);
      expect(() => parseCallConfig(config)).toThrow();
    }
    for (const questions of [
      [null],
      [{}],
      [{ ...emptyCallFunnelConfig().questions[0], options: [null] }],
    ]) {
      expect(
        callConfigIssues({ ...emptyCallFunnelConfig(), questions }).length,
      ).toBeGreaterThan(0);
    }
    for (const url of [
      "javascript:alert(1)",
      "//untrusted.example",
      "https://user:pass@example.com",
      "https://example.com/\npath",
    ]) {
      const config = emptyCallFunnelConfig();
      config.booking.url = url;
      expect(callConfigIssues(config).length).toBeGreaterThan(0);
    }
  });
  it("cleans hidden answers and routes only complete visible answers", () => {
    const config = emptyCallFunnelConfig();
    config.questions = [
      {
        id: "ready",
        type: "single",
        required: true,
        label: "Ready?",
        help: "",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      {
        id: "goal",
        type: "text",
        required: true,
        label: "Goal",
        help: "",
        options: [],
        showWhen: { questionId: "ready", optionId: "yes" },
      },
    ];
    config.qualificationRules = [
      { questionId: "ready", optionId: "no", outcome: "alternative" },
    ];
    const contact = { name: "Applicant", email: "EXAMPLE@example.com" };
    expect(
      evaluateCallApplication(config, { ready: "no" }, contact).outcome,
    ).toBe("alternative");
    expect(() =>
      evaluateCallApplication(config, { ready: "yes" }, contact),
    ).toThrow(/Goal/);
    expect(() =>
      evaluateCallApplication(
        config,
        { ready: "no", goal: "hidden stale answer" },
        contact,
      ),
    ).toThrow(/changed/);
    expect(
      cleanCallAnswers(config, {
        ready: "no",
        goal: "old",
        unexpected: "injected",
      }),
    ).toEqual({ ready: "no" });
    expect(
      evaluateCallApplication(config, { ready: "yes", goal: "Learn" }, contact),
    ).toMatchObject({
      outcome: "qualified",
      contact: { email: "example@example.com" },
    });
  });
});
