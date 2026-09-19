ALTER TABLE public.indexing_log ADD COLUMN IF NOT EXISTS error_message text;
CREATE OR REPLACE FUNCTION public.admin_performance_snapshot(days integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; latest date;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 SELECT max(period_end) INTO latest FROM public.gsc_performance;
 SELECT jsonb_build_object(
 'generated_at',now(),
 'published_resources',(SELECT count(*) FROM generated_pages WHERE status='published'),
 'resource_views_all_time',(SELECT coalesce(sum(views),0) FROM generated_pages WHERE status='published'),
 'cta_clicks',(SELECT count(*) FROM cta_events WHERE event_type='click' AND created_at>=now()-make_interval(days=>days)),
 'review_needed',(SELECT count(*) FROM generated_pages WHERE status='published' AND performance_trend='needs_refresh'),
 'top_pages',coalesce((SELECT jsonb_agg(x) FROM (SELECT p.id,p.title,p.slug,p.views,s.slug AS content_type FROM generated_pages p LEFT JOIN content_schemas s ON s.id=p.content_schema_id WHERE p.status='published' ORDER BY p.views DESC NULLS LAST,p.id LIMIT 10) x),'[]'::jsonb),
 'daily_views',coalesce((SELECT jsonb_agg(x ORDER BY x.day) FROM (SELECT date_trunc('day',created_at AT TIME ZONE 'UTC')::date AS day,count(*) AS views FROM page_engagement WHERE event_type='view' AND created_at>=now()-make_interval(days=>days) GROUP BY 1) x),'[]'::jsonb),
 'search',jsonb_build_object('period_end',latest,'period_start',(SELECT min(period_start) FROM gsc_performance WHERE period_end=latest),'fetched_at',(SELECT max(fetched_at) FROM gsc_performance WHERE period_end=latest),'rows',(SELECT count(*) FROM gsc_performance WHERE period_end=latest),'clicks',(SELECT coalesce(sum(clicks),0) FROM gsc_performance WHERE period_end=latest),'impressions',(SELECT coalesce(sum(impressions),0) FROM gsc_performance WHERE period_end=latest)),
 'queries',coalesce((SELECT jsonb_agg(x) FROM (SELECT page_url,query,clicks,impressions,ctr,position FROM gsc_performance WHERE period_end=latest AND impressions>0 ORDER BY impressions DESC,page_url,query LIMIT 20) x),'[]'::jsonb),
 'jobs',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,status,total_combinations,completed_count,success_count,failed_count,skipped_count,error_message,updated_at FROM generation_jobs ORDER BY updated_at DESC LIMIT 5) x),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_performance_snapshot(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_performance_snapshot(integer) TO authenticated;
