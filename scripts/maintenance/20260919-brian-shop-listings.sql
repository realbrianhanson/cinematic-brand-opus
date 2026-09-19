-- Brian's own Shop listings, authorized September 19, 2026.
-- Owner content only: deliberately not a schema/member migration.
-- Safe to inspect again, but refuses to overwrite either existing listing.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE site_url='https://brianhanson.com' AND author_name='Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'Shop content is restricted to the Brian Hanson owner site';
  END IF;
  IF EXISTS (SELECT 1 FROM public.offers WHERE slug IN ('pushten', 'app-building-workshop')) THEN
    RAISE EXCEPTION 'One of these Shop listings already exists; inspect before applying';
  END IF;
END $$;

INSERT INTO public.offers (
  slug, title, summary, body, status, kind, amount_minor, currency,
  checkout_mode, price_display_mode, external_url, external_button_text,
  is_affiliate, thank_you_message, show_in_shop, shop_category, shop_featured
) VALUES (
  'pushten',
  'PushTen — App & Website Templates',
  'Start with a working template. Make it yours. Build apps and websites for your business or deliver finished projects to clients.',
  $copy$You don't have to start every app or website from a blank screen. PushTen gives you templates you can customize with your own brand, content, and niche.

Explore the template library, follow the video walkthroughs, and use the community to work through your builds. The program includes app-building training and new template releases while your subscription is active.

Commercial rights let you deliver finished apps and websites to clients without per-use royalties. They do not include reselling the templates to other people for resale.

Want to see the approach before choosing a membership? Start with the App Building Workshop in the Shop. When you're ready, open the PushTen page for the current library, membership pricing, and terms.$copy$,
  'published', 'paid', 0, 'usd',
  'external', 'provider', 'https://go.aiforbusiness.com/get-pushten', 'Explore PushTen',
  false, '', true, 'tool', true
), (
  'app-building-workshop',
  'App Building Workshop',
  'See how to turn a template into a branded app or website, and learn the basics of building and delivering projects for clients.',
  $copy$If you've been curious about building apps but don't know where to start, this workshop walks through the process using templates and plain-English instructions.

See how template cloning, branding, and deployment fit together. The workshop also covers client conversations, project pricing, and delivery so you can understand the business side alongside the build.

The workshop introduces the approach behind PushTen and leads into its membership offer. You can review the workshop details and checkout on the registration page before deciding to join.

The workshop page lists a $7 price. Check that page for the current price, access details, and any available extras.$copy$,
  'published', 'paid', 700, 'usd',
  'external', 'fixed', 'https://go.aiforbusiness.com/push-ten-workshop?_go=brian60', 'View the Workshop',
  false, '', true, 'training', true
);
COMMIT;
