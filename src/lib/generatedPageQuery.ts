import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_GENERATED_PAGE_SELECT } from "@/lib/publicColumns";

/**
 * Client-side load of one resource page for /resources/$contentType/$pageSlug.
 *
 * Visitors only ever get published pages. A signed-in viewer's query drops the
 * status filter and leaves the decision to RLS ("status = 'published' OR
 * is_admin(auth.uid())"), so an admin can preview a draft at its own URL while
 * everyone else still gets published rows only. Columns stay on the public
 * allowlist either way.
 */
export async function fetchGeneratedPageForViewer(
  client: typeof supabase,
  contentType: string,
  pageSlug: string,
) {
  const { data: schema } = await client
    .from("content_schemas")
    .select("id, name, slug, renderer_component")
    .eq("slug", contentType)
    .maybeSingle();
  if (!schema) return null;

  const { data: auth } = await client.auth.getSession();
  const signedIn = !!auth?.session;

  let query = client
    .from("generated_pages")
    .select(PUBLIC_GENERATED_PAGE_SELECT)
    .eq("content_schema_id", schema.id)
    .eq("slug", pageSlug);
  if (!signedIn) query = query.eq("status", "published");
  const { data: pg } = await query.maybeSingle();
  if (!pg) return null;
  const niche = pg.niches || { id: null, name: "", slug: "", context: {} };
  return { ...pg, schema, niche };
}
