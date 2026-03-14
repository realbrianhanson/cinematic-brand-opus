CREATE OR REPLACE FUNCTION public.top_pages_by_views(limit_count int DEFAULT 5)
RETURNS TABLE(title text, view_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT gp.title, COUNT(pe.id) as view_count
  FROM page_engagement pe
  JOIN generated_pages gp ON gp.id = pe.page_id
  WHERE pe.event_type = 'view'
  GROUP BY gp.id, gp.title
  ORDER BY view_count DESC
  LIMIT limit_count;
$$;