import { z } from "zod";
import { siteConfig, validateSiteConfig, type SiteConfig } from "./site";
import { memberPreset } from "./presets/member";
const text = z.string().trim().min(1).max(300);
const asset = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => !v || /^https:\/\/[^\s]+$/.test(v) || /^\/(?!\/)[^\s]*$/.test(v),
    "Use an HTTPS URL or site path",
  );
export const setupSchema = z
  .object({
    mode: z.enum(["owner", "member"]),
    name: text,
    initials: z.string().trim().min(1).max(3),
    role: text,
    siteUrl: z
      .string()
      .url()
      .refine((v) => {
        try {
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            u.origin === v &&
            !u.username &&
            !u.password
          );
        } catch {
          return false;
        }
      }, "Use an HTTPS origin without a trailing slash"),
    email: z.union([z.literal(""), z.string().email()]),
    niche: text,
    headline: text,
    description: z.string().trim().min(10).max(500),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo: asset,
    favicon: asset,
    socialImage: asset.refine(
      (v) => !v || v.startsWith("https://"),
      "Social image must use HTTPS",
    ),
    offerLabel: z.string().trim().max(80),
    offerUrl: asset,
    authorBio: z.string().trim().max(2000),
  })
  .refine((v) => !!v.offerLabel === !!v.offerUrl, {
    message: "Provide both the offer label and URL, or leave both empty",
    path: ["offerUrl"],
  });
export type SetupValues = z.infer<typeof setupSchema>;
export function setupDefaults(config: SiteConfig): SetupValues {
  return {
    mode: config.preset === "brian" ? "owner" : "member",
    name: config.identity.name,
    initials: config.identity.logoInitials,
    role: config.identity.role,
    siteUrl: config.identity.siteUrl,
    email: config.identity.contactEmail,
    niche: config.identity.knowsAbout.join(", "),
    headline: config.hero.headlineLines.map((l) => l.text).join(" "),
    description: config.hero.subtitle,
    accent: config.brand.accent,
    logo: config.identity.logoUrl || "",
    favicon: config.metadata.faviconHref || "",
    socialImage: config.metadata.socialImageUrl || "",
    offerLabel: config.hero.primaryCta?.label || "",
    offerUrl: config.hero.primaryCta?.href || "",
    authorBio: "",
  };
}
export function buildRuntimeConfig(input: unknown): SiteConfig {
  const v = setupSchema.parse(input);
  const base = v.mode === "member" ? memberPreset : siteConfig;
  const offer = v.offerUrl ? { label: v.offerLabel, href: v.offerUrl } : null;
  return validateSiteConfig({
    ...base,
    identity: {
      ...base.identity,
      name: v.name,
      legalName: v.name,
      role: v.role,
      tagline: v.niche,
      logoInitials: v.initials,
      logoUrl: v.logo || null,
      siteUrl: v.siteUrl,
      contactEmail: v.email,
      knowsAbout: v.niche
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    },
    metadata: {
      ...base.metadata,
      defaultTitle: `${v.name} | ${v.role}`,
      defaultDescription: v.description,
      socialDescription: v.description,
      socialImageUrl: v.socialImage || null,
      faviconHref: v.favicon || null,
      appleTouchIconHref: v.favicon || null,
      rssTitle: `${v.name} — Articles`,
    },
    brand: {
      ...base.brand,
      accent: v.accent,
      accentLight: v.accent,
      accentDark: v.accent,
    },
    hero: {
      ...base.hero,
      overline: v.role,
      headlineLines: [{ text: v.headline, gold: true }],
      subtitle: v.description,
      primaryCta: offer,
    },
    nav: { ...base.nav, cta: offer, mobileCtaLabel: offer?.label || null },
    content: {
      ...base.content,
      blogDescription: `Practical articles about ${v.niche}.`,
      resourceDescription: `Guides and resources about ${v.niche}.`,
      newsDescription: `Developments and ideas about ${v.niche}.`,
    },
    newsletter: {
      ...base.newsletter,
      intro: `Practical ideas about ${v.niche}, delivered to your inbox.`,
      secondaryCta: offer,
      secondaryCtaLabel: offer ? "Ready for the next step?" : null,
    },
  });
}
export function configFromMatches(
  matches: readonly { loaderData?: unknown }[],
): SiteConfig {
  const data = matches[0]?.loaderData as
    { siteConfig?: SiteConfig } | undefined;
  return data?.siteConfig ?? siteConfig;
}
