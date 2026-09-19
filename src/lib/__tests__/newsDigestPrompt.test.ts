import { describe, expect, it } from "vitest";
import { buildNewsDigestPrompt } from "../../../supabase/functions/_shared/newsDigestPrompt";

describe("news research scope", () => {
  it("keeps practical business constraints for the known business lanes", () => {
    const prompt = buildNewsDigestPrompt("ai_tools", "AI launches");
    expect(prompt).toContain(
      "Each item must address a specific small-business task",
    );
    expect(prompt).toContain("school-only programs");
    expect(prompt).toContain("original article URLs");
  });
  it("preserves a member's custom niche without applying Brian's audience exclusions", () => {
    const prompt = buildNewsDigestPrompt(
      "education",
      "Teaching and school programs",
    );
    expect(prompt).toContain("about Teaching and school programs");
    expect(prompt).toContain(
      "directly relevant to Teaching and school programs",
    );
    expect(prompt).not.toContain(
      "Each item must address a specific small-business task",
    );
    expect(prompt).not.toContain("school-only programs");
    expect(prompt).toContain(
      "source publication timestamp (null if unverified)",
    );
    expect(prompt).toContain("Never invent a source");
  });
});
