import { supabase } from "@/integrations/supabase/client";
export async function loadContentQueue() {
  const results = await Promise.all([
    supabase
      .from("content_opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("posts")
      .select(
        "id,title,quality_score,originality_score,source_citations,opportunity_id,created_at,fact_check",
      )
      .eq("status", "draft")
      .not("opportunity_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("source_items")
      .select("id,url,title,topic_lane,status,published_at,fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(50),
    supabase
      .from("site_settings_private")
      .select(
        "id,auto_publish_enabled,auto_publish_daily_cap,auto_publish_min_quality",
      )
      .limit(1)
      .maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    opps: results[0].data ?? [],
    posts: results[1].data ?? [],
    items: results[2].data ?? [],
    settings: results[3].data,
    checkedAt: new Date().toISOString(),
  };
}
