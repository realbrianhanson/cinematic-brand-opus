import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../components/admin/${name}`, import.meta.url)),
    "utf8",
  );

describe("integration links", () => {
  it.each([
    ["SiteSetup.tsx", "Configure your integrations"],
    ["PseoDashboard.tsx", "Configure the integration"],
  ])("%s sends '%s' to site settings, not the password page", (file, text) => {
    const match = source(file).match(new RegExp(`to="([^"]+)">\\s*${text}`));
    expect(match?.[1]).toBe("/admin/site-settings");
  });
});
