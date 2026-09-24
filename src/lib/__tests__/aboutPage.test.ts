import { describe, expect, it } from "vitest";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import {
  aboutDescription,
  aboutPageHead,
  aboutPersonJsonLd,
} from "../aboutPage";

const settings = {
  site_name: "Brian Hanson",
  site_url: "https://brianhanson.com",
  author_name: "Brian Hanson",
  author_title:
    "4x Inc. 5000 Entrepreneur · AI Educator · Founder, AI For Business",
  author_bio: "Brian Hanson is a 4x Inc. 5000 entrepreneur.",
  author_credentials: ["Artificial Intelligence"],
  author_social_links: {},
};

describe("/about page metadata", () => {
  it("has a canonical URL, title and a description without a closing period", () => {
    const head = aboutPageHead(brianPreset, settings);
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: "https://brianhanson.com/about",
    });
    expect(head.meta).toContainEqual({ title: "About Brian Hanson" });
    const description = head.meta.find(
      (m) => "name" in m && m.name === "description",
    ) as { content: string };
    expect(description.content).toMatch(/Iowa/);
    expect(description.content.endsWith(".")).toBe(false);
  });

  it("describes Brian as a Person with only stored facts and no invented profiles", () => {
    const person = aboutPersonJsonLd(brianPreset, settings) as Record<
      string,
      unknown
    >;
    expect(person["@type"]).toBe("Person");
    expect(person.name).toBe("Brian Hanson");
    expect(person.jobTitle).toBe(settings.author_title);
    expect(person.url).toBe("https://brianhanson.com/");
    expect(person).not.toHaveProperty("sameAs");
    const withProfiles = aboutPersonJsonLd(brianPreset, {
      ...settings,
      author_social_links: { linkedin: "https://www.linkedin.com/in/example" },
    }) as Record<string, unknown>;
    expect(withProfiles.sameAs).toEqual([
      "https://www.linkedin.com/in/example",
    ]);
  });

  it("links the ProfilePage and breadcrumbs to the same person", () => {
    const head = aboutPageHead(brianPreset, settings);
    const blocks = head.scripts.map((s) => JSON.parse(s.children));
    const types = blocks.map((b) => b["@type"]);
    expect(types).toEqual(
      expect.arrayContaining(["Person", "ProfilePage", "BreadcrumbList"]),
    );
    const profile = blocks.find((b) => b["@type"] === "ProfilePage");
    expect(profile.mainEntity["@id"]).toBe("https://brianhanson.com/#person");
  });

  it("never reuses Brian's story for a member install", () => {
    expect(aboutDescription(memberPreset, null)).not.toMatch(/Iowa|Brian/);
  });
});
