-- Brian-authorized owner content. Apply only after GitHub sync and asset publish.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.site_settings WHERE site_url='https://brianhanson.com' AND author_name='Brian Hanson') THEN
    RAISE EXCEPTION 'Brian owner site required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offers WHERE id='6689db7a-432b-41d9-8b73-2f89c32c67b4' AND cover_url='https://brianhanson.com/shop/app-building-workshop-v1.webp' AND updated_at='2026-09-20 04:28:59.026989+00') THEN
    RAISE EXCEPTION 'Workshop changed; inspect before applying';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.offers WHERE id='e605661a-8652-4949-b20c-8ec37c4f98d6' AND slug='ai-follow-up-starter-kit' AND updated_at='2026-09-20 04:28:59.027267+00') THEN
    RAISE EXCEPTION 'Kit changed; inspect before applying';
  END IF;
END $$;
-- Keep historical order access and snapshots intact; remove the unapproved offer.
UPDATE public.offers SET status='archived',show_in_shop=false,shop_featured=false WHERE id='e605661a-8652-4949-b20c-8ec37c4f98d6';
INSERT INTO public.offers (id,slug,title,summary,body,status,kind,amount_minor,currency,checkout_mode,price_display_mode,external_url,external_button_text,show_in_shop,shop_category,shop_featured,next_offer_window_minutes)
VALUES ('7919a6b8-bb80-4fd4-9951-4ae44132d5f9','personal-agent-webinar','Free Personal Agent Webinar','New to AI agents? Learn how to set up your own personal agent in this free beginner webinar.',
$copy$Start with your own personal agent. This free webinar walks beginners through setting one up, so you have a practical place to begin.

## Learn the setup
Follow a beginner-friendly introduction to setting up your own personal agent.

## Get free access
Use the button below to visit the registration page and sign up for the webinar.$copy$,
'published','free',0,'usd','external','fixed','https://agents.aiforbusiness.com/free-agent','Join the Free Webinar',true,'training',true,0);
UPDATE public.offers SET cover_url='https://brianhanson.com/shop/app-building-workshop-v2.png' WHERE id='6689db7a-432b-41d9-8b73-2f89c32c67b4';
COMMIT;
