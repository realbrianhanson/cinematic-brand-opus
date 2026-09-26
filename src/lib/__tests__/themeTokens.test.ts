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

describe("public light palette", () => {
  const lightCss = readFileSync(
    fileURLToPath(new URL("../../styles/public-theme.css", import.meta.url)),
    "utf8",
  );
  const color = (token: string) => {
    const value = lightCss.match(
      new RegExp(`--${token}:\\s*(#[0-9a-f]{6});`),
    )?.[1];
    if (!value) throw new Error(`Missing light palette color: ${token}`);
    return value;
  };
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  it("uses pure white for the public canvas and cards", () => {
    for (const token of ["site-surface", "background", "card", "popover"])
      expect(color(token)).toBe("#ffffff");
  });
  it("keeps every body, muted and accent text color above 4.5:1 on white", () => {
    const tokens = [
      ...lightCss.matchAll(
        /--(site-text-\d+|site-ink|site-accent-ink|site-error-ink|body-muted|label-muted):\s*#[0-9a-f]{6};/g,
      ),
    ].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(20);
    for (const token of tokens)
      expect(
        1.05 / (luminance(color(token)) + 0.05),
        token,
      ).toBeGreaterThanOrEqual(4.5);
  });
});
