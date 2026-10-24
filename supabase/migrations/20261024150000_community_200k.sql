-- The AI For Business community passed 200,000. Update stored copy that still says 150,000.
update public.site_settings
  set author_bio = replace(author_bio, 'more than 150,000 business owners', 'more than 200,000 business owners')
  where author_bio like '%150,000 business owners%';

update public.generated_pages
  set content_json = replace(content_json::text, 'teaching 150,000 members', 'teaching 200,000 members')::jsonb
  where content_json::text like '%teaching 150,000 members%';

update public.niches
  set expert_pov = replace(replace(expert_pov, '150,000+ member', '200,000+ member'), 'it''s 150,000+ members', 'it''s 200,000+ members')
  where expert_pov like '%150,000+ member%';
