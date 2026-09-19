-- Owner-only editorial refinement. Run after the structured body renderer ships.
-- Refuses to overwrite content that changed after review. Not a member migration.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE changed integer;
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE site_url='https://brianhanson.com' AND author_name='Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'This editorial update is restricted to Brian Hanson';
  END IF;

  UPDATE public.offers SET body=$copy$Your next app doesn't need to start from zero. Start with a working template, make it yours, and put it to use in your business or a client project.

## A starting point you can build on
- App and website templates you can customize for your brand and niche.
- Video walkthroughs and app-building training to guide the work.
- A community to work through your builds with.
- New template releases while your subscription is active.

## Build for yourself. Deliver for clients.
Use the templates for your own business or deliver finished apps and websites to clients. Commercial rights cover those finished projects without per-use royalties; they do not include reselling the templates for other people to resell.

## Want to see the process first?
The App Building Workshop is a useful starting point if you'd like to see how template cloning, branding, and deployment fit together before choosing a membership.

Explore the PushTen page for the current library, membership pricing, access details, and terms.$copy$
  WHERE id='696e657e-2856-41e0-ac89-3e433d0f7f67' AND slug='pushten'
    AND checkout_mode='external' AND external_url='https://go.aiforbusiness.com/get-pushten'
    AND md5(body)='78bcc67aa73dd9aa43fb0fd7cc7e28c2';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'PushTen content changed; inspect before applying'; END IF;

  UPDATE public.offers SET body=$copy$You've got an idea for an app or website. This workshop shows you how a template, your brand, and plain-English instructions can become a practical starting point for the build.

## See how the pieces fit together
- Start with a template and adapt it to a business or niche.
- Work through cloning, branding, and deployment.
- Understand client conversations, project pricing, and delivery alongside the build.

## Start here if you're new to building
You don't need to arrive with a finished app idea or a coding background. The workshop introduces the approach behind PushTen so you can see the process before deciding whether its membership is right for you.

## What happens next
Continue to the workshop page to review the full offer, current price, and access details. The workshop leads into the PushTen membership offer; joining that membership is a separate decision.$copy$
  WHERE id='6689db7a-432b-41d9-8b73-2f89c32c67b4' AND slug='app-building-workshop'
    AND checkout_mode='external' AND external_url='https://go.aiforbusiness.com/push-ten-workshop?_go=brian60'
    AND md5(body)='0d4915473018f07c3cc13006eca60556';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Workshop content changed; inspect before applying'; END IF;
END $$;
COMMIT;
