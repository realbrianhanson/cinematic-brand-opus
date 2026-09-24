import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brandStyles } from "@/config/brandStyles";

const css = readFileSync(
  fileURLToPath(new URL("../../styles.css", import.meta.url)),
  "utf8",
);
const HSL_TRIPLET = /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/;

const alphaOf = (token: string) => {
  const match = css.match(
    new RegExp(
      `--${token}:\\s*(?:rgba\\(255, ?255, ?255, ?|hsl\\(0 0% 100% \\/ )([0-9.]+)\\)`,
    ),
  );
  return match ? Number(match[1]) : NaN;
};

describe("theme tokens", () => {
  it("maps Tailwind's accent colour through hsl() so bg-accent is visible", () => {
    expect(css).toContain("--color-accent: hsl(var(--accent));");
    expect(css).toContain(
      "--color-accent-foreground: hsl(var(--accent-foreground));",
    );
  });

  it("keeps every --accent definition in the bare-triplet format brandStyles emits", () => {
    const definitions = [
      ...css.matchAll(/^\s*--accent(-foreground)?:\s*([^;]+);/gm),
    ];
    expect(definitions.length).toBeGreaterThanOrEqual(4);
    for (const [, , value] of definitions) expect(value).toMatch(HSL_TRIPLET);
    const accent = brandStyles({
      accent: "#d4af55",
      accentLight: "#e8c96a",
      accentDark: "#a8873a",
      backdrop: "#07080e",
    } as Parameters<typeof brandStyles>[0])["--accent" as never] as string;
    expect(accent).toMatch(HSL_TRIPLET);
  });

  it("keeps muted public text at or above 60% white", () => {
    for (const token of ["muted-foreground", "body-muted", "label-muted"])
      expect(alphaOf(token), token).toBeGreaterThanOrEqual(0.6);
  });

  it("raises faint public utility text to the contrast floor", () => {
    for (const alpha of ["40", "45", "50", "55"])
      expect(css).toContain(`:where(.public-site) .text-white\\/${alpha}`);
  });
});
