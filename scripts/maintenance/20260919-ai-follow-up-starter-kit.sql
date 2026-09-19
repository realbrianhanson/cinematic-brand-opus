-- Owner-authorized real lead magnet, not QA data or a member schema migration.
-- Upload the exact checked-in PDF privately before applying this transaction.
-- SHA-256 db76186cd892ee5e4d9c6f6888bfac9c78fccf28782a1ce230795f7d0e0e47ee
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings WHERE site_url='https://brianhanson.com' AND author_name='Brian Hanson'
  ) THEN RAISE EXCEPTION 'This content belongs only to the Brian Hanson owner site'; END IF;
  IF EXISTS (SELECT 1 FROM public.offers WHERE id='e605661a-8652-4949-b20c-8ec37c4f98d6' OR slug='ai-follow-up-starter-kit') THEN
    RAISE EXCEPTION 'The starter kit already exists; inspect it rather than overwriting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
    WHERE o.bucket_id='offer-files' AND b.public=false
      AND o.name='e605661a-8652-4949-b20c-8ec37c4f98d6/2026-09-19-v1-ai-follow-up-starter-kit.pdf'
      AND o.metadata->>'mimetype'='application/pdf'
      AND (o.metadata->>'size')::bigint=103372
  ) THEN RAISE EXCEPTION 'The verified PDF must exist in private offer storage before publication'; END IF;
END $$;

INSERT INTO public.offers (
  id, slug, title, summary, body, status, kind, amount_minor, currency,
  checkout_mode, price_display_mode, asset_path, asset_name,
  thank_you_message, show_in_shop, shop_category, shop_featured
) VALUES (
  'e605661a-8652-4949-b20c-8ec37c4f98d6', 'ai-follow-up-starter-kit',
  'AI Follow-Up Starter Kit',
  'Turn rough meeting notes into a clearer client follow-up. Get five reusable prompts, a worked example, and a pre-send checklist in a free 7-page PDF.',
  $copy$The useful part of AI is what you can do with it today. Start with one task you already know: following up after a client conversation.

## What is inside
- A one-page input sheet to capture the facts, commitments, and open questions.
- Five prompts to organize notes, draft a message, improve clarity, write a respectful reminder, and check the result.
- A fictional landscaping-business example showing the notes, a reviewed draft, and what still needs a human check.
- A pre-send checklist for names, dates, promises, privacy, and the next action.

## How to use it
Choose one follow-up. Fill in the input sheet, copy the prompt you need into an AI tool you already use, and check the draft against your notes. You decide whether and when to send it.

## Format and access
Free 7-page PDF. No payment card is needed. Enter your email to get the resource and its access link. Newsletter signup is separate. The PDF includes a next step into the free AI for Business Summit when you want to see more practical examples.

## Clear expectations
This is an educational starter kit. The worked example is fictional, not a customer result. No particular reply rate, time saving, or income is promised. You can adapt the prompts and worksheets for your own work and client work; do not resell or redistribute the original kit as your own.$copy$,
  'published', 'free', 0, 'usd', 'native', 'fixed',
  'e605661a-8652-4949-b20c-8ec37c4f98d6/2026-09-19-v1-ai-follow-up-starter-kit.pdf',
  'AI-Follow-Up-Starter-Kit.pdf',
  'Your kit is ready. Start with the input sheet, try one prompt, and check the draft before sending. The final page links to the free AI for Business Summit if you would like to keep learning.',
  true, 'resource', true
);
COMMIT;
