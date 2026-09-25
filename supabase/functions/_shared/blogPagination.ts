/** One-based, bounded archive pages; only content filters enter canonical URLs. */
export function blogSearch(search: Record<string, unknown>) {
  const raw = search.page;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^[1-9][0-9]{0,4}$/.test(raw)
        ? Number(raw)
        : 1;
  return {
    page:
      Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : 1,
    category:
      typeof search.category === "string"
        ? search.category.trim().slice(0, 200)
        : "",
  };
}
export function blogArchivePath(page: number, category = ""): string {
  const search = new URLSearchParams();
  if (category) search.set("category", category);
  if (page > 1) search.set("page", String(page));
  return `/blog${search.size ? `?${search.toString()}` : ""}`;
}
