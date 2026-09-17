import { validateSiteConfig, type SiteConfig } from "./types";
import { brianPreset } from "./presets/brian";
import { memberPreset } from "./presets/member";

/**
 * Single source of truth for every piece of public homepage / chrome copy.
 *
 * To rebrand this site, change ACTIVE_PRESET below (and edit or duplicate the
 * preset it points at). Components never hardcode names, metrics or links.
 *
 * NOTE: publishing, newsletter sending, A.I. generation and feeds read their
 * own values from the `site_settings` row in the database. Keep the two in
 * sync — see PUSH_TEN_SETUP.md, "Keeping config and database aligned".
 */
export const PRESETS = {
  brian: brianPreset,
  member: memberPreset,
} satisfies Record<string, SiteConfig>;

export type PresetName = keyof typeof PRESETS;

/** Live site preset. Members switch this to their own preset. */
export const ACTIVE_PRESET: PresetName = "brian";

export const siteConfig: SiteConfig = validateSiteConfig(
  PRESETS[ACTIVE_PRESET],
);

/** Absolute canonical URL for a site-relative path. */
export const absoluteUrl = (path = "/"): string => {
  const base = siteConfig.identity.siteUrl.replace(/\/+$/, "");
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

/** "Page title | Site Name", avoiding a duplicated suffix. */
export const pageTitle = (title: string): string =>
  title.endsWith(siteConfig.identity.name)
    ? title
    : `${title} | ${siteConfig.identity.name}`;

export const copyrightLine = (): string => {
  const holder = siteConfig.identity.legalName || siteConfig.identity.name;
  const year = new Date().getFullYear();
  const from = siteConfig.identity.foundedYear;
  const range = from && from < year ? `${from}–${year}` : String(from ?? year);
  return `© ${range} ${holder}. All rights reserved.`;
};

export { validateSiteConfig, SiteConfigError, isValidHref } from "./types";
export type * from "./types";
