import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { readBoundedJson } from "../_shared/boundedJson.ts";
import {
  readAllSiloRows,
  rebuildSiloLinks,
  SiloPageNotFound,
  type SiloPage,
  type SiloPillar,
  type StoredSiloLink,
} from "./links.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const pageColumns =
  "id, niche_id, content_schema_id, title, status, published_at, created_at, content_schemas(name), niches!generated_pages_niche_id_fkey(name)";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // This includes the service-role calls made by generate-pillar; an arbitrary
  // bearer is still verified against auth and the administrator role.
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const body = await readBoundedJson(req, 2048);
    const pageId = body?.page_id;
    if (
      !body ||
      (body.rebuild_all !== true &&
        (typeof pageId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            pageId,
          )))
    )
      return json(
        { error: "Provide a valid page_id or rebuild_all: true" },
        400,
      );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await rebuildSiloLinks(
      {
        pages: () =>
          readAllSiloRows<SiloPage>((from, to) =>
            admin
              .from("generated_pages")
              .select(pageColumns)
              .eq("status", "published")
              .order("id")
              .range(from, to)
              .returns<SiloPage[]>(),
          ),
        pillars: () =>
          readAllSiloRows<SiloPillar>((from, to) =>
            admin
              .from("pillar_pages")
              .select("id, niche_id, title")
              .eq("status", "published")
              .order("id")
              .range(from, to),
          ),
        links: () =>
          readAllSiloRows<StoredSiloLink>((from, to) =>
            admin
              .from("internal_links")
              .select("*")
              .eq("source_page_type", "generated")
              .in("link_type", ["silo_up", "silo_sibling"])
              .order("id")
              .range(from, to),
          ),
        async page(id) {
          const { data, error } = await admin
            .from("generated_pages")
            .select(pageColumns)
            .eq("id", id)
            .returns<SiloPage[]>()
            .maybeSingle();
          if (error) throw new Error(error.message);
          return data;
        },
        async insert(links) {
          const { error } = await admin.from("internal_links").insert(links);
          if (error) throw new Error(error.message);
        },
        async update(id, link) {
          const { data, error } = await admin
            .from("internal_links")
            .update(link)
            .eq("id", id)
            .select("id");
          if (error) throw new Error(error.message);
          if (!data?.length)
            throw new Error(
              "An internal link changed during the rebuild. Retry the operation.",
            );
        },
        async remove(ids) {
          const { error } = await admin
            .from("internal_links")
            .delete()
            .in("id", ids);
          if (error) throw new Error(error.message);
        },
      },
      body.rebuild_all === true ? undefined : (pageId as string),
    );
    return json(result);
  } catch (error) {
    if (error instanceof SiloPageNotFound)
      return json({ error: "Page not found" }, 404);
    console.error("Build silo links failed:", error);
    return json(
      {
        error:
          "Links could not be fully rebuilt. Existing links were kept until replacements were saved. Retry the rebuild.",
      },
      500,
    );
  }
});
