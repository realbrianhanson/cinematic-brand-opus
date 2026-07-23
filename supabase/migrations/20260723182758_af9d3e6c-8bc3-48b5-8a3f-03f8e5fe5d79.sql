UPDATE public.source_items
SET full_content = regexp_replace(full_content, '\s*## Why it matters for Jacksonville businesses.*$', '', 's')
WHERE full_content ILIKE '%## Why it matters for Jacksonville businesses%';

-- Collapse [outer [inner](URL)](URL) -> [outer inner](URL) for aiforbeginners.com CTA
UPDATE public.source_items
SET full_content = regexp_replace(
  full_content,
  '\[([^\]\[]*)\[([^\]]+)\]\((https://aiforbeginners\.com[^)]*)\)([^\]\[]*)\]\(\3\)',
  '[\1\2\4](\3)',
  'g'
)
WHERE full_content LIKE '%](https://aiforbeginners.com)](%'
   OR full_content ~ '\[[^\]\[]*\[[^\]]+\]\(https://aiforbeginners\.com[^)]*\)[^\]\[]*\]\(https://aiforbeginners\.com[^)]*\)';