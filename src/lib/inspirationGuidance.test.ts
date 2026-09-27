import { describe, expect, it } from "vitest";
import {
  INSPIRATION_SOURCES,
  INVITATION_PACING,
  buildInspirationPrompt,
} from "./inspirationGuidance";
import {
  buildCallFunnelScriptDocument,
  buildCallFunnelScriptPrompt,
  emptyCallFunnelScripts,
  normalizeCallFunnelScripts,
  validateCallFunnelScripts,
} from "./callFunnelScripts";

describe("private research notes and writing guidance", () => {
  it("normalizes legacy notes and preserves valid source/adaptation without changing existing copy", () => {
    const legacy = normalizeCallFunnelScripts({
      invitation: "Keep the owner's script",
    });
    expect(legacy.inspirationSource).toBe("");
    expect(legacy.inspirationPattern).toBe("");
    expect(legacy.experimentNote).toBe("");
    expect(legacy.invitation).toBe("Keep the owner's script");
    const value = {
      ...legacy,
      inspirationSource: "justin",
      inspirationPattern: "Our three actual steps",
      experimentNote: "Hypothesis only",
    };
    expect(
      normalizeCallFunnelScripts(JSON.parse(JSON.stringify(value))),
    ).toEqual(value);
    expect(validateCallFunnelScripts(value)).toEqual([]);
  });

  it("rejects invalid note values before saving and safely handles untrusted drafts", () => {
    for (const value of [
      { inspirationSource: "unknown" },
      { inspirationPattern: {} },
      { experimentNote: "x".repeat(1201) },
    ])
      expect(validateCallFunnelScripts(value)).toHaveLength(1);
    const normalized = normalizeCallFunnelScripts({
      inspirationSource: "unknown",
      inspirationPattern: {},
      experimentNote: "x".repeat(1201),
    });
    expect(normalized.inspirationSource).toBe("");
    expect(normalized.inspirationPattern).toBe("");
    expect(normalized.experimentNote).toHaveLength(1200);
  });

  it("includes the selected original guidance but excludes experiment notes from writing prompts", () => {
    const notes = {
      ...emptyCallFunnelScripts(),
      inspirationSource: "closers",
      inspirationPattern: 'Our supported "diagnosis"',
      experimentNote: "PRIVATE EXPERIMENT RESULT: no measured result",
      callOutcome: "Choose a workflow to examine.",
    };
    const prompt = buildCallFunnelScriptPrompt(notes, "Owner offer");
    expect(prompt).toContain("https://g.closers.io/app-1o1-fb");
    expect(prompt).toContain(JSON.stringify(notes.inspirationPattern));
    expect(prompt).toContain(notes.callOutcome);
    expect(prompt).not.toContain(notes.experimentNote);
    const exported = buildCallFunnelScriptDocument(notes);
    expect(exported).toContain("PRIVATE EXPERIMENT LOG — NOT CUSTOMER PROOF");
    expect(exported).toContain(notes.experimentNote);
    expect(prompt).toContain("not verified competitor runtimes");
    expect(
      INVITATION_PACING.reduce((total, beat) => total + beat.percent, 0),
    ).toBe(100);
    for (const source of INSPIRATION_SOURCES) {
      expect(new URL(source.url).protocol).toBe("https:");
      expect(new URL(source.url).search).toBe("");
    }
    expect(
      buildInspirationPrompt({
        inspirationSource: "unknown",
        inspirationPattern: "",
        experimentNote: "",
      }),
    ).toContain("No competitor pattern selected");
  });
});
