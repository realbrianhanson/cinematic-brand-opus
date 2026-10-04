-- Apply after the GitHub commit has synced and this asset is live.
BEGIN;
UPDATE public.offers
SET cover_url='https://brianhanson.com/shop/personal-agent-webinar-v1.png'
WHERE id='7919a6b8-bb80-4fd4-9951-4ae44132d5f9'
  AND slug='personal-agent-webinar'
  AND cover_url IS NULL
  AND updated_at='2026-10-04 07:20:19.025663+00';
COMMIT;
