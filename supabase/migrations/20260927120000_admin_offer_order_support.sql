-- Read-only support projection. No private download capabilities, provider secrets
-- or email payloads are exposed; native payment mode comes only from verified facts.
-- Each support page reads at most 25 orders; index membership so finding their
-- delivery attempts does not scan the complete transactional outbox 25 times.
CREATE INDEX IF NOT EXISTS offer_access_deliveries_order_ids_idx
  ON public.offer_access_deliveries USING gin(order_ids);

CREATE FUNCTION public.admin_offer_order_support(_query text DEFAULT '', _status text DEFAULT 'all', _kind text DEFAULT 'all', _page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE term text; result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(auth.uid()),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _query IS NULL OR length(_query)>200 OR _status IS NULL OR _status NOT IN ('all','pending','fulfilled','failed','expired','refunded') OR _kind IS NULL OR _kind NOT IN ('all','free','paid') OR _page IS NULL OR _page<0 OR _page>100000 THEN RAISE EXCEPTION 'Invalid order filters'; END IF;
  term := '%' || replace(replace(replace(trim(_query), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  WITH filtered AS MATERIALIZED (
    SELECT o.* FROM public.offer_orders o
    WHERE (_status='all' OR o.status=_status)
      AND (_kind='all' OR (_kind='free' AND o.amount_minor=0) OR (_kind='paid' AND o.amount_minor>0))
      AND (trim(_query)='' OR o.email ILIKE term OR coalesce(o.name,'') ILIKE term OR o.title_snapshot ILIKE term OR o.id::text ILIKE term
        OR EXISTS(SELECT 1 FROM public.offer_order_items i WHERE i.order_id=o.id AND i.title_snapshot ILIKE term))
  ), page AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT 25 OFFSET _page*25)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',o.id,'offer_id',o.offer_id,'parent_order_id',o.parent_order_id,
      'title',o.title_snapshot,'name',o.name,'email',o.email,'status',o.status,
      'amount_minor',o.amount_minor,'currency',o.currency,'created_at',o.created_at,'fulfilled_at',o.fulfilled_at,
      'payment_mode',coalesce(f.payment_mode,'unknown'),'download_link_issued_at',f.first_download_at,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('offer_id',i.offer_id,'role',i.role,'title',i.title_snapshot,'amount_minor',i.amount_minor,'currency',i.currency,'file_name',i.asset_name_snapshot) ORDER BY CASE i.role WHEN 'primary' THEN 0 ELSE 1 END,i.id) FROM public.offer_order_items i WHERE i.order_id=o.id),'[]'::jsonb),
      'delivery',(SELECT jsonb_build_object('kind',d.kind,'status',d.status,'attempts',d.attempts,'created_at',d.created_at,'accepted_at',d.sent_at) FROM public.offer_access_deliveries d WHERE d.order_ids @> ARRAY[o.id] ORDER BY d.created_at DESC,d.id LIMIT 1)
    ) ORDER BY o.created_at DESC,o.id) FROM page o LEFT JOIN public.conversion_order_facts f ON f.order_id=o.id
  ),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_offer_order_support(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_order_support(text,text,text,integer) TO authenticated;
