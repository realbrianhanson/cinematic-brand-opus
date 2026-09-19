import { describe, expect, it, vi } from "vitest";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
const branding = vi.hoisted(() => vi.fn());
vi.mock("@/lib/branding.functions", () => ({ getSiteBranding: branding }));
vi.mock("@/pages/SpeakingPage", () => ({ default: () => null }));
import { Route } from "@/routes/speaking";

describe("speaking availability respects runtime ownership", () => {
  const loader = Route.options.loader as () => Promise<unknown>;
  it("loads the owner's configured speaking page", async () => {
    branding.mockResolvedValue(brianPreset);
    await expect(loader()).resolves.toBe(brianPreset);
  });
  it("returns not found for a member who has not enabled speaking", async () => {
    branding.mockResolvedValue(memberPreset);
    await expect(loader()).rejects.toMatchObject({ isNotFound: true });
  });
});
