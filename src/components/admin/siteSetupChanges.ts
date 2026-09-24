import { setupDefaults, setupSchema, type SetupValues } from "@/config/runtime";
import type { SiteConfig } from "@/config/types";
import type { Database } from "@/integrations/supabase/types";

/** The live Brand & publishing row returned by admin_read_site_settings. */
export type LiveSiteSettings = Pick<
  Database["public"]["Functions"]["admin_read_site_settings"]["Returns"][number],
  | "site_name"
  | "site_url"
  | "author_name"
  | "author_title"
  | "author_bio"
  | "author_credentials"
  | "author_social_links"
  | "publisher_name"
  | "publisher_url"
  | "cta_headline"
  | "cta_subtext"
  | "cta_button_text"
  | "cta_url"
  | "cta_social_proof"
>;

export interface SetupChange {
  label: string;
  from: string;
  to: string;
}

export interface SetupChangePlan {
  website: SetupChange[];
  publishing: SetupChange[];
  /** True when applying clears author credentials and social links. */
  memberReset: boolean;
}

const EMPTY = "(empty)";
const CLEARED = "(cleared)";

const websiteLabels: Record<Exclude<keyof SetupValues, "authorBio">, string> = {
  mode: "Starting point",
  name: "Name or brand",
  initials: "Logo initials",
  role: "Homepage role line and page title",
  siteUrl: "Canonical website address",
  email: "Public contact email",
  niche: "Topics / niche",
  headline: "Homepage headline",
  description: "Homepage description and SEO description",
  accent: "Accent color",
  logo: "Logo image",
  favicon: "Favicon",
  socialImage: "Social preview image",
  offerLabel: "Homepage and navigation call-to-action label",
  offerUrl: "Homepage and navigation call-to-action destination",
};

const show = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? EMPTY : value;

/**
 * Seed the wizard from what is live: the stored branding when it exists,
 * otherwise the live runtime config. The author bio always comes from the
 * live Brand & publishing row, which is where it is edited.
 */
export function seedSetupValues(
  config: SiteConfig,
  storedBranding: unknown,
  row: LiveSiteSettings | undefined,
): SetupValues {
  const stored =
    storedBranding == null ? null : setupSchema.safeParse(storedBranding);
  const base = stored?.success ? stored.data : setupDefaults(config);
  return { ...base, authorBio: row?.author_bio ?? base.authorBio };
}

/** Stored branding mode, mirroring the reset check in save_site_branding. */
export function storedBrandingMode(
  storedBranding: unknown,
): "owner" | "member" | null {
  const mode = (storedBranding as { mode?: unknown } | null)?.mode;
  return mode === "owner" || mode === "member" ? mode : null;
}

function change(
  label: string,
  from: string | null | undefined,
  to: string | null | undefined,
): SetupChange[] {
  const a = show(from);
  const b = show(to);
  return a === b ? [] : [{ label, from: a, to: b }];
}

function describeLinks(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

/**
 * Exactly which live values an apply will change. The Brand & publishing
 * rows mirror public.save_site_branding: owner mode keeps the article
 * call-to-action box and byline title; member mode rewrites them and the
 * first member apply clears credentials and social links.
 */
export function planSiteSetupChanges(input: {
  current: SetupValues;
  next: SetupValues;
  row: LiveSiteSettings | undefined;
  storedMode: "owner" | "member" | null;
}): SetupChangePlan {
  const { current, next, row } = input;
  const website = (
    Object.keys(websiteLabels) as (keyof typeof websiteLabels)[]
  ).flatMap((key) => change(websiteLabels[key], current[key], next[key]));
  const member = next.mode === "member";
  const memberReset = member && input.storedMode !== "member";
  const bio = member ? next.authorBio : next.authorBio || row?.author_bio;
  const publishing = [
    ...change("Site name", row?.site_name, next.name),
    ...change("Site URL", row?.site_url, next.siteUrl),
    ...change("Author name (byline)", row?.author_name, next.name),
    ...change("Publisher name", row?.publisher_name, next.name),
    ...change("Publisher URL", row?.publisher_url, next.siteUrl),
    ...change("Author bio", row?.author_bio, bio),
  ];
  if (member) {
    publishing.push(
      ...change("Author byline title", row?.author_title, next.role),
      ...change("Article CTA headline", row?.cta_headline, next.headline),
      ...change("Article CTA text", row?.cta_subtext, next.description),
      ...change("Article CTA button", row?.cta_button_text, next.offerLabel),
      ...change("Article CTA link", row?.cta_url, next.offerUrl),
    );
    if (row?.cta_social_proof)
      publishing.push({
        label: "Article CTA social proof",
        from: row.cta_social_proof,
        to: CLEARED,
      });
  }
  if (memberReset) {
    const credentials = (row?.author_credentials || []).join(", ");
    const links = describeLinks(row?.author_social_links);
    if (credentials)
      publishing.push({
        label: "Author credentials",
        from: credentials,
        to: CLEARED,
      });
    if (links)
      publishing.push({
        label: "Author social links",
        from: links,
        to: CLEARED,
      });
  }
  return { website, publishing, memberReset };
}

/** Host of the live site, typed to confirm switching to a member brand. */
export function confirmationHost(siteUrl: string) {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
}
