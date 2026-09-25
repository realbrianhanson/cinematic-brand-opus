/** Reconcile links only after every source read succeeds. Deno-free for tests. */
export interface SiloPage {
  id: string;
  niche_id: string | null;
  content_schema_id: string;
  title: string;
  status: string;
  published_at: string | null;
  created_at: string | null;
  content_schemas: { name: string } | null;
  niches: { name: string } | null;
}
export interface SiloPillar {
  id: string;
  niche_id: string | null;
  title: string;
}
export interface SiloLink {
  source_page_id: string;
  source_page_type: "generated";
  target_page_id: string;
  target_page_type: "generated" | "pillar";
  link_type: "silo_up" | "silo_sibling";
  anchor_text: string;
  position: "related" | "pillar_banner";
}
export interface StoredSiloLink extends SiloLink {
  id: string;
}
export interface SiloStore {
  pages(): Promise<SiloPage[]>;
  pillars(): Promise<SiloPillar[]>;
  links(): Promise<StoredSiloLink[]>;
  page(id: string): Promise<SiloPage | null>;
  insert(links: SiloLink[]): Promise<void>;
  update(id: string, link: SiloLink): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export class SiloPageNotFound extends Error {}

const key = (link: SiloLink) =>
  [link.source_page_id, link.target_page_id, link.link_type].join(":");

function pickAnchor(page: SiloPage, sourceId: string): string {
  const name = page.content_schemas?.name ?? "";
  const niche = page.niches?.name ?? "";
  const variants = [
    `${name} for ${niche}`,
    `${niche} ${name.toLowerCase()}`,
    `Explore ${name.toLowerCase()}`,
    page.title.length <= 60 ? page.title : `${page.title.slice(0, 57)}...`,
  ];
  const hash = (sourceId + page.id)
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[hash % variants.length];
}

export function desiredSiloLinks(
  page: SiloPage,
  pages: SiloPage[],
  pillars: SiloPillar[],
): SiloLink[] {
  // Unassigned resources must not become an accidental cross-topic silo.
  if (!page.niche_id || page.status !== "published") return [];
  const links: SiloLink[] = [];
  const pillar = pillars.find(
    (candidate) => candidate.niche_id === page.niche_id,
  );
  if (pillar)
    links.push({
      source_page_id: page.id,
      source_page_type: "generated",
      target_page_id: pillar.id,
      target_page_type: "pillar",
      link_type: "silo_up",
      anchor_text: pillar.title,
      position: "pillar_banner",
    });
  const siblings = pages
    .filter(
      (candidate) =>
        candidate.status === "published" &&
        candidate.id !== page.id &&
        candidate.niche_id === page.niche_id &&
        candidate.content_schema_id !== page.content_schema_id,
    )
    .sort((a, b) => {
      const time = (p: SiloPage) =>
        Date.parse(p.published_at || p.created_at || "") || 0;
      return time(b) - time(a) || a.id.localeCompare(b.id);
    })
    .slice(0, 10);
  for (const sibling of siblings)
    links.push({
      source_page_id: page.id,
      source_page_type: "generated",
      target_page_id: sibling.id,
      target_page_type: "generated",
      link_type: "silo_sibling",
      anchor_text: pickAnchor(sibling, page.id),
      position: "related",
    });
  return links;
}

/**
 * Preserve existing IDs/click history for unchanged links. New and updated
 * links are persisted before any obsolete links are removed. A failed source
 * read or insert never erases the old graph, and every write failure rejects.
 */
export async function rebuildSiloLinks(store: SiloStore, pageId?: string) {
  const [pages, pillars, existing, requested] = await Promise.all([
    store.pages(),
    store.pillars(),
    store.links(),
    pageId ? store.page(pageId) : Promise.resolve(null),
  ]);
  if (pageId && !requested) throw new SiloPageNotFound("Page not found");

  const affected = new Set<string>();
  if (requested) {
    affected.add(requested.id);
    for (const page of pages)
      if (requested.niche_id && page.niche_id === requested.niche_id)
        affected.add(page.id);
    // Moving/unpublishing a page also repairs pages that previously linked to it.
    for (const link of existing)
      if (link.target_page_id === requested.id)
        affected.add(link.source_page_id);
  } else {
    for (const page of pages) affected.add(page.id);
    for (const link of existing) affected.add(link.source_page_id);
  }
  const desired = pages
    .filter((page) => affected.has(page.id))
    .flatMap((page) => desiredSiloLinks(page, pages, pillars));
  const desiredByKey = new Map(desired.map((link) => [key(link), link]));
  const seen = new Set<string>();
  const obsolete: string[] = [];
  const updates: { id: string; link: SiloLink }[] = [];
  for (const stored of existing) {
    if (!affected.has(stored.source_page_id)) continue;
    const identity = key(stored);
    const wanted = desiredByKey.get(identity);
    if (!wanted || seen.has(identity)) {
      obsolete.push(stored.id);
      continue;
    }
    seen.add(identity);
    if (
      Object.entries(wanted).some(
        ([field, value]) => stored[field as keyof SiloLink] !== value,
      )
    )
      updates.push({ id: stored.id, link: wanted });
  }
  const additions = desired.filter((link) => !seen.has(key(link)));
  for (let offset = 0; offset < additions.length; offset += 200)
    await store.insert(additions.slice(offset, offset + 200));
  for (const update of updates) await store.update(update.id, update.link);
  for (let offset = 0; offset < obsolete.length; offset += 200)
    await store.remove(obsolete.slice(offset, offset + 200));
  return {
    success: true,
    links_created: additions.length,
    links_updated: updates.length,
    links_removed: obsolete.length,
  };
}

/** PostgREST caps result sets; never silently rebuild from the first 1,000 rows. */
export async function readAllSiloRows<T>(
  load: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const batchSize = 500;
  for (let offset = 0; ;) {
    const result = await load(offset, offset + batchSize - 1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data)
      throw new Error("The link source query returned no result.");
    if (result.data.length === 0) return rows;
    rows.push(...result.data);
    // A deployment can configure a smaller API cap than our requested range.
    // Advance by what actually arrived and stop only at an empty page.
    offset += result.data.length;
  }
}
