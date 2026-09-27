import { describe, expect, it } from "vitest";
import {
  emptyCallFunnelConfig,
  callConfigIssues,
  parseCallConfig,
  publicCallConfig,
  evaluateCallApplication,
  cleanCallAnswers,
} from "@/lib/callFunnels";

describe("versioned call funnel contract", () => {
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
