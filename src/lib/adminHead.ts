/**
 * Browser-tab title and crawler rules for an admin page.
 *
 * Deeper route matches override the root route's public title and social
 * tags (TanStack keeps the deepest meta per name/property), so each admin tab
 * is distinguishable and no admin URL is ever indexed.
 */
export const ADMIN_TITLE_SUFFIX = "Admin";

export function adminHead(label: string) {
  const title = `${label} · ${ADMIN_TITLE_SUFFIX}`;
  return () => ({
    meta: [
      { title },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: title },
      { name: "twitter:title", content: title },
    ],
  });
}
