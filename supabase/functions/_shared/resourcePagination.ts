import { blogSearch } from "./blogPagination.ts";

export const RESOURCE_PAGE_SIZE = 12;
export function resourceSearch(search: Record<string, unknown>) {
  return {
    page: blogSearch(search).page,
    niche:
      typeof search.niche === "string" ? search.niche.trim().slice(0, 200) : "",
  };
}
export function resourceArchivePath(contentType: string, page = 1, niche = "") {
  const params = new URLSearchParams();
  if (niche) params.set("niche", niche);
  if (page > 1) params.set("page", String(page));
  return `/resources/${encodeURIComponent(contentType)}${params.size ? `?${params}` : ""}`;
}
