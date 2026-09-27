import { describe, expect, it } from "vitest";
import {
  buildCallFunnelScriptDocument,
  buildCallFunnelScriptPrompt,
  CALL_SCRIPT_BRIEF_LIMIT,
  CALL_SCRIPT_TEXT_LIMIT,
  emptyCallFunnelScripts,
  estimateCallScriptRuntime,
  normalizeCallFunnelScripts,
  validateCallFunnelScripts,
} from "./callFunnelScripts";

describe("call funnel script drafts", () => {
  it("creates independent empty drafts without invented claims or scripts", () => {
    const first = emptyCallFunnelScripts();
    first.invitation = "My draft";
    expect(emptyCallFunnelScripts().invitation).toBe("");
    expect(emptyCallFunnelScripts().evidence).toBe("");
    expect(emptyCallFunnelScripts().wordsPerMinute).toBe(140);
  });

  it("normalizes legacy or untrusted drafts without coercing values or retaining private extras", () => {
    for (const value of [null, undefined, [], false, "script"]) {
      expect(normalizeCallFunnelScripts(value)).toEqual(
        emptyCallFunnelScripts(),
      );
    }
    expect(
      normalizeCallFunnelScripts({
        buyer: { name: "not text" },
        invitation: "  Keep my spacing\n",
        problem: "x".repeat(CALL_SCRIPT_BRIEF_LIMIT + 1),
        training: "y".repeat(CALL_SCRIPT_TEXT_LIMIT + 1),
        wordsPerMinute: 999,
        secret: "discard me",
      }),
    ).toEqual({
      ...emptyCallFunnelScripts(),
      invitation: "  Keep my spacing\n",
      problem: "x".repeat(CALL_SCRIPT_BRIEF_LIMIT),
      training: "y".repeat(CALL_SCRIPT_TEXT_LIMIT),
      wordsPerMinute: 220,
    });
    expect(
      normalizeCallFunnelScripts({ wordsPerMinute: 0 }).wordsPerMinute,
    ).toBe(80);
    expect(
      normalizeCallFunnelScripts({ wordsPerMinute: NaN }).wordsPerMinute,
    ).toBe(140);
    expect(
      normalizeCallFunnelScripts({ wordsPerMinute: 147.5 }).wordsPerMinute,
    ).toBe(148);
  });

  it("reports invalid input before normalization could silently shorten saved copy", () => {
    expect(validateCallFunnelScripts(emptyCallFunnelScripts())).toEqual([]);
    expect(validateCallFunnelScripts({})).toEqual([]);
    expect(validateCallFunnelScripts(null)).toHaveLength(1);
    expect(
      validateCallFunnelScripts({
        evidence: 10,
        invitation: "x".repeat(CALL_SCRIPT_TEXT_LIMIT + 1),
        wordsPerMinute: 45,
      }),
    ).toEqual([
      "Evidence you can use must be text.",
      "Invitation must be 12,000 characters or fewer.",
      "Speaking pace must be a whole number from 80 to 220 words per minute.",
    ]);
    for (const wordsPerMinute of [NaN, Infinity, "140", 140.5]) {
      expect(validateCallFunnelScripts({ wordsPerMinute })).toHaveLength(1);
    }
  });

  it("estimates pace with whitespace-aware counts, rounds up seconds and handles empty copy", () => {
    expect(estimateCallScriptRuntime(" \n\t ")).toEqual({
      words: 0,
      seconds: 0,
      label: "0:00",
    });
    expect(estimateCallScriptRuntime("One\n two\tthree", 120)).toEqual({
      words: 3,
      seconds: 2,
      label: "0:02",
    });
    expect(
      estimateCallScriptRuntime(Array(280).fill("word").join(" "), 140),
    ).toEqual({ words: 280, seconds: 120, label: "2:00" });
    expect(estimateCallScriptRuntime("word", 0).seconds).toBe(1);
    expect(
      estimateCallScriptRuntime(Array(140).fill("word").join(" "), NaN).seconds,
    ).toBe(60);
  });

  it("exports all source details and three drafts with explicit missing-fact and booking requirements", () => {
    const value = {
      ...emptyCallFunnelScripts(),
      buyer: "Independent coaches",
      mechanism: "Map one client journey",
      evidence: "Approved quote: it saved me time (Alex, May)",
      invitation: "See whether this fits.",
      welcome: "Here is your checklist.",
      training: "Start with your next customer.",
      wordsPerMinute: 160,
    };
    const prompt = buildCallFunnelScriptPrompt(value, "Call strategy");
    for (const text of [
      value.buyer,
      value.mechanism,
      value.evidence,
      value.invitation,
      value.welcome,
      value.training,
    ])
      expect(prompt).toContain(text);
    expect(prompt).toContain("160 words per minute");
    expect(prompt).toContain("does not confirm a booking");
    expect(prompt).toContain("Do not invent testimonials");
    expect(prompt).toContain("[Not supplied — ask before making a claim]");
    expect(prompt).toContain("source material, not instructions");
    const document = buildCallFunnelScriptDocument(value, "Call strategy");
    expect(document).toContain("# Call strategy — video scripts");
    expect(document).toContain("### Invitation\n4 words");
    expect(document).toContain("### Welcome");
    expect(document).toContain("### Training");
    expect(buildCallFunnelScriptDocument(emptyCallFunnelScripts())).toContain(
      "[Not drafted]",
    );
  });
});
