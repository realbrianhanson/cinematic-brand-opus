-- Brian-supplied Lynn Hutchison testimonial; owner content, not a member migration.
-- Publish the generic offer quote renderer before applying this transaction.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.site_settings IN SHARE MODE;

DO $update_testimonial$
DECLARE
  target_id CONSTANT uuid := '696e657e-2856-41e0-ac89-3e433d0f7f67'::uuid;
  original_body CONSTANT text := $original_body$Your next app doesn't need to start from zero. Start with a working template, make it yours, and put it to use in your business or a client project.

## A starting point you can build on
- App and website templates you can customize for your brand and niche.
- Video walkthroughs and app-building training to guide the work.
- A community to work through your builds with.
- New template releases while your subscription is active.

## Build for yourself. Deliver for clients.
Use the templates for your own business or deliver finished apps and websites to clients. Commercial rights cover those finished projects without per-use royalties; they do not include reselling the templates for other people to resell.

## Want to see the process first?
The App Building Workshop is a useful starting point if you'd like to see how template cloning, branding, and deployment fit together before choosing a membership.

Explore the PushTen page for the current library, membership pricing, access details, and terms.$original_body$;
  desired_body CONSTANT text := $desired_body$Your next app doesn't need to start from zero. Start with a working template, make it yours, and put it to use in your business or a client project.

## A starting point you can build on
- App and website templates you can customize for your brand and niche.
- Video walkthroughs and app-building training to guide the work.
- A community to work through your builds with.
- New template releases while your subscription is active.

## Build for yourself. Deliver for clients.
Use the templates for your own business or deliver finished apps and websites to clients. Commercial rights cover those finished projects without per-use royalties; they do not include reselling the templates for other people to resell.

## From a PushTen participant

> Brian's 2-day PushTen seminar was phenomenal. He covers from A-Z all of the steps of what to do to build your AI business using tools like Lovable, GoHighLevel, Claude, and many other AI tools and knowledge to successfully build your apps and take your ideas and businesses to market. I highly recommend it to anyone, both beginners and advanced, to the PushTen 2-day seminar program and to the PushTen program too. I would also like to thank both Brian and the team for being very helpful and ready to answer any and all of the questions posted by the group. This is a truly amazing team of people who are extremely excited and generous about sharing all that there is currently in AI and to teaching you how to do it too. Wonderful experience!
>
> Thank you so much!
>
> — Lynn Hutchison

## Want to see the process first?
The App Building Workshop is a useful starting point if you'd like to see how template cloning, branding, and deployment fit together before choosing a membership.

Explore the PushTen page for the current library, membership pricing, access details, and terms.$desired_body$;
  current_slug text;
  current_body text;
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE site_url = 'https://brianhanson.com'
      AND author_name = 'Brian Hanson'
      AND site_name = 'Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'This testimonial belongs only to the Brian Hanson owner site';
  END IF;

  SELECT slug, body INTO current_slug, current_body
  FROM public.offers WHERE id = target_id FOR UPDATE;
  IF NOT FOUND OR current_slug IS DISTINCT FROM 'pushten' THEN
    RAISE EXCEPTION 'Expected PushTen offer is missing or has changed slug';
  END IF;
  IF current_body IS NOT DISTINCT FROM desired_body THEN
    RAISE NOTICE 'Lynn Hutchison testimonial already present; no update needed';
    RETURN;
  END IF;
  IF current_body IS DISTINCT FROM original_body THEN
    RAISE EXCEPTION 'PushTen description has changed; inspect before applying testimonial';
  END IF;

  UPDATE public.offers SET body = desired_body
  WHERE id = target_id AND slug = 'pushten' AND body = original_body;
END $update_testimonial$;

-- Only body is assigned. The existing trigger also advances updated_at.
COMMIT;

