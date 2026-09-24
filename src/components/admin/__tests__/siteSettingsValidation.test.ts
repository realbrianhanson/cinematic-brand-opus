import { describe, expect, it } from "vitest";
import {
  isHttpsOrigin,
  normalizeOrigin,
  validateSiteSettings,
  type ValidatedSettings,
} from "../site-settings/validation";

const valid: ValidatedSettings = {
  site_url: "https://brianhanson.com",
  publisher_url: "https://brianhanson.com",
  cta_url: "https://go.aiforbusiness.com/summit?_go=brian60",
  newsletter_from_address: "Brian Hanson <brian@m.brianhanson.com>",
  newsletter_reply_to: "brian@realagency.com",
  report_email: "",
  report_enabled: false,
  author_social_links: {},
};

describe("isHttpsOrigin", () => {
  it("accepts an https origin, with or without a trailing slash", () => {
    expect(isHttpsOrigin("https://brianhanson.com")).toBe(true);
    expect(isHttpsOrigin(" https://brianhanson.com/ ")).toBe(true);
  });
  it("rejects missing scheme, http, paths, credentials and bare hosts", () => {
    expect(isHttpsOrigin("brianhanson.com")).toBe(false);
    expect(isHttpsOrigin("http://brianhanson.com")).toBe(false);
    expect(isHttpsOrigin("https://brianhanson.com/blog")).toBe(false);
    expect(isHttpsOrigin("https://a:b@brianhanson.com")).toBe(false);
    expect(isHttpsOrigin("https://localhost")).toBe(false);
    expect(isHttpsOrigin("")).toBe(false);
  });
  it("normalizes to the origin the database constraint expects", () => {
    expect(normalizeOrigin(" https://BrianHanson.com/ ")).toBe(
      "https://brianhanson.com",
    );
  });
});

describe("validateSiteSettings", () => {
  it("passes the current production values", () => {
    expect(validateSiteSettings(valid)).toEqual({});
  });

  it("requires an https site URL", () => {
    expect(
      validateSiteSettings({ ...valid, site_url: "brianhanson.com" }),
    ).toEqual({
      site_url:
        "Enter your full web address starting with https://, like https://yourdomain.com",
    });
    expect(validateSiteSettings({ ...valid, site_url: "" }).site_url).toMatch(
      /https/,
    );
  });

  it("checks optional URLs only when filled in", () => {
    expect(
      validateSiteSettings({ ...valid, publisher_url: "", cta_url: "" }),
    ).toEqual({});
    expect(
      validateSiteSettings({ ...valid, publisher_url: "www.x.com" }),
    ).toHaveProperty("publisher_url");
    expect(validateSiteSettings({ ...valid, cta_url: "/summit" })).toEqual({});
    expect(
      validateSiteSettings({ ...valid, cta_url: "javascript:alert(1)" }),
    ).toHaveProperty("cta_url");
    expect(
      validateSiteSettings({ ...valid, cta_url: "//evil.example" }),
    ).toHaveProperty("cta_url");
  });

  it("checks sender, reply-to and report email formats", () => {
    const errs = validateSiteSettings({
      ...valid,
      newsletter_from_address: "Brian <brian@m.brianhanson.com",
      newsletter_reply_to: "brian@",
      report_email: "me at example.com",
    });
    expect(Object.keys(errs).sort()).toEqual([
      "newsletter_from_address",
      "newsletter_reply_to",
      "report_email",
    ]);
    expect(errs.newsletter_from_address).toMatch(/Name <you@domain.com>/);
  });

  it("requires a report email when weekly reports are switched on", () => {
    expect(
      validateSiteSettings({ ...valid, report_enabled: true }),
    ).toHaveProperty("report_email");
    expect(
      validateSiteSettings({
        ...valid,
        report_enabled: true,
        report_email: "brian@realagency.com",
      }),
    ).toEqual({});
  });

  it("requires https social links, keyed per platform", () => {
    expect(
      validateSiteSettings({
        ...valid,
        author_social_links: {
          linkedin: "https://linkedin.com/in/brian",
          twitter: "x.com/brian",
          youtube: "",
        },
      }),
    ).toEqual({ "social.twitter": "Use a full https:// link" });
  });
});
