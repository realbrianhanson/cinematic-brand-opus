CREATE OR REPLACE FUNCTION public.public_resource_counts() RETURNS TABLE(content_schema_id uuid,page_count bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT content_schema_id,count(*) FROM public.generated_pages WHERE status='published' GROUP BY content_schema_id $$;
GRANT EXECUTE ON FUNCTION public.public_resource_counts() TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_content_breakdown() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator required'; END IF;
 RETURN jsonb_build_object(
 'formats',coalesce((SELECT jsonb_agg(x) FROM (SELECT coalesce(s.name,'Uncategorized') AS name,count(*) AS pages,coalesce(sum(p.views),0) AS views FROM generated_pages p LEFT JOIN content_schemas s ON s.id=p.content_schema_id WHERE p.status='published' GROUP BY s.name ORDER BY sum(p.views) DESC NULLS LAST) x),'[]'::jsonb),
 'niches',coalesce((SELECT jsonb_agg(x) FROM (SELECT coalesce(n.name,'Unassigned') AS name,count(*) AS pages,coalesce(sum(p.views),0) AS views,coalesce(sum(c.clicks),0) AS clicks FROM generated_pages p LEFT JOIN niches n ON n.id=p.niche_id LEFT JOIN (SELECT page_id,count(*) AS clicks FROM cta_events WHERE event_type='click' GROUP BY page_id) c ON c.page_id=p.id WHERE p.status='published' GROUP BY n.name ORDER BY sum(p.views) DESC NULLS LAST LIMIT 20) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_content_breakdown() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_content_breakdown() TO authenticated;
