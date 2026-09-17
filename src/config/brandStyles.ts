import type { CSSProperties } from "react";
import type { BrandTokens } from "./types";
function hsl(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b),
    delta = hi - lo,
    lightness = (hi + lo) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue =
    delta === 0
      ? 0
      : hi === r
        ? ((g - b) / delta) % 6
        : hi === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return `${hue.toFixed(2)} ${(saturation * 100).toFixed(2)}% ${(lightness * 100).toFixed(2)}%`;
}
export function brandStyles(brand: BrandTokens): CSSProperties {
  return {
    "--brand-accent": brand.accent,
    "--accent": hsl(brand.accent),
    "--brand-accent-light": brand.accentLight,
    "--brand-accent-dark": brand.accentDark,
    "--brand-backdrop": brand.backdrop,
    "--brand-backdrop-rgb": [1, 3, 5]
      .map((i) => parseInt(brand.backdrop.slice(i, i + 2), 16))
      .join(","),
    "--brand-accent-rgb": [1, 3, 5]
      .map((i) => parseInt(brand.accent.slice(i, i + 2), 16))
      .join(","),
    "--gold": brand.accent,
    "--gold-light": brand.accentLight,
    "--gold-gradient": `linear-gradient(135deg,${brand.accent},${brand.accentLight})`,
  } as CSSProperties;
}
