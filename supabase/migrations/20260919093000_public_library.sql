CREATE OR REPLACE FUNCTION public.search_public_library(term text, page integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF length(term)>200 OR page<0 OR page>10000 THEN RAISE EXCEPTION 'Invalid search'; END IF;
 WITH entries AS (
 SELECT 'article'::text AS kind,title,excerpt AS description,'/blog/'||slug AS path FROM posts WHERE status='published'
 UNION ALL SELECT 'guide',title,seo_meta->>'meta_description','/guides/'||slug FROM pillar_pages WHERE status='published'
 UNION ALL SELECT 'resource',p.title,p.seo_meta->>'meta_description','/resources/'||s.slug||'/'||p.slug FROM generated_pages p JOIN content_schemas s ON s.id=p.content_schema_id WHERE p.status='published' AND s.is_active
 ), matches AS (SELECT * FROM entries WHERE position(lower(trim(term)) in lower(title||' '||coalesce(description,'')))>0), paged AS (SELECT * FROM matches ORDER BY title,path LIMIT 24 OFFSET page*24)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),'items',coalesce((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.search_public_library(text,integer) TO anon,authenticated;
