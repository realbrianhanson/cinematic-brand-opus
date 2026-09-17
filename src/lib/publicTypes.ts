import type {
  getPublicPostBySlug,
  getPublicPillarBySlug,
  getPublicGeneratedPage,
  getPublicSiteSettings,
  getPublicNewsItem,
} from "./publicData.functions";
export type PublicPost = Awaited<ReturnType<typeof getPublicPostBySlug>>;
export type PublicPillar = Awaited<ReturnType<typeof getPublicPillarBySlug>>;
export type PublicGeneratedPage = Awaited<
  ReturnType<typeof getPublicGeneratedPage>
>;
export type PublicSiteSettings = Awaited<
  ReturnType<typeof getPublicSiteSettings>
>;
export type PublicNewsItem = Awaited<ReturnType<typeof getPublicNewsItem>>;
