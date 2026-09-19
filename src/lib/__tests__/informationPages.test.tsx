import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import {
  informationPageHead,
  informationPages,
  isBrianOwner,
  supportMailto,
} from "@/lib/informationPages";
import SitePolicy from "@/pages/SitePolicy";
import StartHere from "@/pages/StartHere";
import Support from "@/pages/Support";
import type { ShopOffer } from "@/lib/shop";

vi.mock("@/components/Nav", () => ({ default: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const member = {
  ...memberPreset,
  identity: {
    ...memberPreset.identity,
    name: "Cedar Learning",
    legalName: "Cedar Learning",
    siteUrl: "https://cedar.example",
    contactEmail: "help@cedar.example",
  },
};

describe("new visitor and customer information pages", () => {
  it("uses the active member identity in every route's server-rendered metadata", () => {
    for (const path of Object.keys(
      informationPages,
    ) as (keyof typeof informationPages)[]) {
      const head = informationPageHead(path, [
        { loaderData: { siteConfig: member } },
      ]);
      expect(JSON.stringify(head)).toContain(`https://cedar.example${path}`);
      expect(JSON.stringify(head)).toContain("Cedar Learning");
      expect(JSON.stringify(head)).not.toContain("brianhanson");
    }
  });
  it("keeps the owner address, AI demonstration, event, and infrastructure out of member pages", () => {
    const html = renderToStaticMarkup(
      <SiteConfigContext.Provider value={member}>
        <SitePolicy kind="privacy" />
        <SitePolicy kind="terms" />
        <StartHere offers={[]} />
        <Support />
      </SiteConfigContext.Provider>,
    );
    expect(html).toContain("Cedar Learning");
    expect(html).toContain("help@cedar.example");
    for (const ownerDetail of [
      "Brian",
      "Jacksonville",
      "Atlantic Blvd",
      "Maya",
      "Cloudflare",
      "aiforbusiness",
    ])
      expect(html).not.toContain(ownerDetail);
    expect(html).toContain("/offer-access?recover=1");
  });
  it("requires owner identity, origin, and preset together before showing owner material", () => {
    expect(isBrianOwner(brianPreset)).toBe(true);
    expect(
      isBrianOwner({
        ...brianPreset,
        identity: {
          ...brianPreset.identity,
          siteUrl: "https://member.example",
        },
      }),
    ).toBe(false);
    expect(
      isBrianOwner({ ...memberPreset, identity: brianPreset.identity }),
    ).toBe(false);
  });
  it("only promotes the free offer actually supplied by the public showcase", () => {
    const offer = {
      slug: "cedar-checklist",
      title: "Cedar Checklist",
      summary: "A useful checklist.",
      kind: "free",
    } as ShopOffer;
    const html = renderToStaticMarkup(
      <SiteConfigContext.Provider value={member}>
        <StartHere offers={[offer]} />
      </SiteConfigContext.Provider>,
    );
    expect(html).toContain("/offers/cedar-checklist");
    expect(html).toContain("Cedar Checklist");
    expect(html).not.toContain("ai-follow-up");
    const empty = renderToStaticMarkup(
      <SiteConfigContext.Provider value={member}>
        <StartHere offers={[]} />
      </SiteConfigContext.Provider>,
    );
    expect(empty).not.toContain("Get the free resource");
  });
  it("never turns invalid contact configuration into a mail link or mail headers", () => {
    expect(supportMailto("help@example.com", "Order #1 & question")).toBe(
      "mailto:help%40example.com?subject=Order%20%231%20%26%20question",
    );
    expect(supportMailto("person@example.com\r\nBcc:x@example.com")).toBeNull();
    expect(supportMailto("")).toBeNull();
    expect(supportMailto("javascript:alert(1)")).toBeNull();
  });
});
