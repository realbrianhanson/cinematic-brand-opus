import { useSiteConfig } from "@/config/SiteConfigContext";

/** The first call application with a home band, as a link to its page. */
export function useHomeBand() {
  const { callShowcases } = useSiteConfig();
  const entry = Object.entries(callShowcases ?? {}).find(
    ([, showcase]) => showcase.homeBand,
  );
  return entry && { href: `/calls/${entry[0]}`, ...entry[1].homeBand! };
}
