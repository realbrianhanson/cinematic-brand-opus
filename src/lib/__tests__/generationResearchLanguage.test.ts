import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These are prompt-policy regressions: generated or retrieved text must not
// acquire a fabricated editorial-review status before any provider is called.
describe("generator research language", () => {
  it.each(["generate-content", "generate-pillar"])(
    "%s does not invent verification or declare a vendor blacklist defunct",
    (entry) => {
      const source = readFileSync(
        new URL(
          `../../../supabase/functions/${entry}/index.ts`,
          import.meta.url,
        ),
        "utf8",
      );
      expect(source).not.toMatch(
        /VERIFIED REAL-TIME RESEARCH DATA|CURRENT, VERIFIED information|known defunct\/outdated|verified against \$\{currentYear\} sources/,
      );
      expect(source).toContain("not been independently fact-checked");
      if (entry === "generate-content") {
        expect(source).toContain(
          "without a linked current source supporting that status",
        );
      }
    },
  );
});
