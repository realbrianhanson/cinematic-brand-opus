import { describe, expect, it } from "vitest";
import {
  measurementPath,
  measurementAttribution,
  measurementHostAllowed,
  sessionIsFresh,
  cleanCampaign,
} from "../measurement";

describe("optional first-party measurement boundaries", () => {
  it("only permits known public paths and never records query strings or private access routes", () => {
    expect(measurementPath("/shop")).toBe("/shop");
    expect(measurementPath("/about")).toBe("/about");
    expect(measurementPath("/first-ai-build")).toBe("/first-ai-build");
    expect(measurementPath("/first-ai-build?business=private")).toBeNull();
    expect(measurementPath("/offers/free-guide")).toBe("/offers/free-guide");
    for (const path of [
      "/admin",
      "/admin/posts/new",
      "/offer-access",
      "/shop?email=private@example.com",
      "/#token=secret",
      "/unknown/private@example.com",
      "/offers/%40secret",
    ])
      expect(measurementPath(path)).toBeNull();
  });
  it("allows only the configured canonical host and excludes development hosts even when configured", () => {
    expect(
      measurementHostAllowed("https://example.com", "https://example.com"),
    ).toBe(true);
    expect(
      measurementHostAllowed(
        "https://preview.example.com",
        "https://example.com",
      ),
    ).toBe(false);
    expect(
      measurementHostAllowed("http://127.0.0.1:8090", "http://127.0.0.1:8090"),
    ).toBe(false);
    expect(
      measurementHostAllowed(
        "https://member.lovable.app",
        "https://member.lovable.app",
      ),
    ).toBe(true);
  });
  it("uses only bounded campaign slugs and broad source labels", () => {
    expect(cleanCampaign(" Fall-2026 ")).toBe("fall-2026");
    for (const value of [
      "person@example.com",
      "https://secret.test",
      "hello%40secret",
      "a".repeat(65),
      "quoted value",
    ])
      expect(cleanCampaign(value)).toBe("");
    expect(
      measurementAttribution(
        "https://example.com/?utm_source=Newsletter&utm_medium=email&utm_campaign=fall&utm_term=private@example.com",
        "https://google.com/search?q=secret",
        "https://example.com",
      ),
    ).toEqual({ source: "newsletter", medium: "email", campaign: "fall" });
    expect(
      measurementAttribution(
        "https://example.com/",
        "https://private-client.example/secret?email=someone@example.com",
        "https://example.com",
      ),
    ).toEqual({ source: "other_referral", medium: "referral", campaign: "" });
    expect(
      measurementAttribution(
        "https://example.com/",
        "https://example.com/offer-access#token=secret",
        "https://example.com",
      ),
    ).toEqual({ source: "direct", medium: "direct", campaign: "" });
  });
  it("expires short sessions at inactivity and absolute limits", () => {
    const now = 1_800_000_000_000;
    expect(sessionIsFresh({ created: now - 1000, last: now - 500 }, now)).toBe(
      true,
    );
    expect(
      sessionIsFresh(
        { created: now - 31 * 60_000, last: now - 31 * 60_000 },
        now,
      ),
    ).toBe(false);
    expect(
      sessionIsFresh({ created: now - 25 * 3600_000, last: now - 500 }, now),
    ).toBe(false);
    expect(sessionIsFresh({ created: now + 1, last: now + 1 }, now)).toBe(
      false,
    );
  });
});
