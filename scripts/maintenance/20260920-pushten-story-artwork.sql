-- Owner-only PushTen copy and inline artwork; not a member migration.
-- Publish and verify the generic image renderer and both assets before applying.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.site_settings IN SHARE MODE;

DO $update_pushten$
DECLARE
  target_id CONSTANT uuid := '696e657e-2856-41e0-ac89-3e433d0f7f67'::uuid;
  original_content CONSTANT jsonb := $original_content${"body":"Your next app doesn't need to start from zero. Start with a working template, make it yours, and put it to use in your business or a client project.\n\n## A starting point you can build on\n- App and website templates you can customize for your brand and niche.\n- Video walkthroughs and app-building training to guide the work.\n- A community to work through your builds with.\n- New template releases while your subscription is active.\n\n## Build for yourself. Deliver for clients.\nUse the templates for your own business or deliver finished apps and websites to clients. Commercial rights cover those finished projects without per-use royalties; they do not include reselling the templates for other people to resell.\n\n## From a PushTen participant\n\n> Brian's 2-day PushTen seminar was phenomenal. He covers from A-Z all of the steps of what to do to build your AI business using tools like Lovable, GoHighLevel, Claude, and many other AI tools and knowledge to successfully build your apps and take your ideas and businesses to market. I highly recommend it to anyone, both beginners and advanced, to the PushTen 2-day seminar program and to the PushTen program too. I would also like to thank both Brian and the team for being very helpful and ready to answer any and all of the questions posted by the group. This is a truly amazing team of people who are extremely excited and generous about sharing all that there is currently in AI and to teaching you how to do it too. Wonderful experience!\n>\n> Thank you so much!\n>\n> — Lynn Hutchison\n\n## Want to see the process first?\nThe App Building Workshop is a useful starting point if you'd like to see how template cloning, branding, and deployment fit together before choosing a membership.\n\nExplore the PushTen page for the current library, membership pricing, access details, and terms.","summary":"Start with a working template. Make it yours. Build apps and websites for your business or deliver finished projects to clients.","external_button_text":"Explore PushTen"}$original_content$::jsonb;
  desired_content CONSTANT jsonb := $desired_content${"summary":"Build your next app or website from a working template. Make it yours, put it to work in your business, or deliver it to a client—with training and a community to help you move forward.","external_button_text":"See What's Included in PushTen","body":"## Building from scratch costs more than the tools.\n\nOne more prompt. One more fix. One more late night.\n\nIt's easy to count the subscriptions. Harder to count the hours spent rebuilding the basics, second-guessing the setup, and trying to get all the pieces to work together.\n\n![Illustration of Brian Hanson building apps late at night, surrounded by tool bills and unfinished work](https://brianhanson.com/shop/pushten-diy-costs-v1.webp \"The late nights, tool bills, and rebuilds don't show up in the finished app.\")\n\nThat's why I built PushTen: a membership with app and website templates, video walkthroughs, training, and a private community. Choose a template, customize it for your business or a client, and start with something you can build on.\n\n## A template is the beginning. Here's what comes with it.\n\n- App and website templates you can customize for your brand and niche.\n- Video walkthroughs for every template, so you can follow the process.\n- Training on cloning, setup, and customization.\n- A private community of other builders.\n- New templates added while you're subscribed.\n- Commercial and white-label rights for finished projects.\n\n## Meet the AI addict behind PushTen.\n\n![Playful AI Addict booking-style illustration of Brian Hanson, co-founder of AI for Business](https://brianhanson.com/shop/brian-ai-addict-v1.webp \"AI Addict? Guilty as charged.\")\n\nI'm Brian Hanson, co-founder of AI for Business. Another tool to test. Another app to build. Another idea I have to try. Guilty as charged.\n\nWith PushTen, that enthusiasm comes with something you can use: templates to customize, walkthroughs to follow, and a community to build alongside.\n\n## From a PushTen participant\n\n> Brian's 2-day PushTen seminar was phenomenal. He covers from A-Z all of the steps of what to do to build your AI business using tools like Lovable, GoHighLevel, Claude, and many other AI tools and knowledge to successfully build your apps and take your ideas and businesses to market. I highly recommend it to anyone, both beginners and advanced, to the PushTen 2-day seminar program and to the PushTen program too. I would also like to thank both Brian and the team for being very helpful and ready to answer any and all of the questions posted by the group. This is a truly amazing team of people who are extremely excited and generous about sharing all that there is currently in AI and to teaching you how to do it too. Wonderful experience!\n>\n> Thank you so much!\n>\n> — Lynn Hutchison\n\n## Build for your business. Deliver for clients.\n\nMake a template fit your own business, or customize it into a finished app or website for a client. Commercial and white-label rights cover those finished projects, with no per-use royalties to PushTen.\n\nThose rights do not include reselling the templates for other people to resell. Check the current membership terms and any third-party tools your project uses before choosing a build.\n\n## Your first project starts with one good template.\n\n- Pick one project: choose the business need you want to solve and a template that fits.\n- Make it yours: adapt the branding, copy, content, and features to the people who will use it.\n- Test the whole experience: connect what it needs, check the important flows, and publish when it's ready.\n\nBring a project you're ready to work on. PushTen gives you the template and guidance; you make the decisions, connect the tools, and test the finished experience.\n\n## Ready to get past the blank screen?\n\nSee what's included and review the current membership options on the PushTen enrollment page. Choose the access that fits your next project."}$desired_content$::jsonb;
  current_content jsonb;
  current_slug text;
  current_status text;
  current_checkout_mode text;
  current_external_url text;
  changed integer;
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE site_url = 'https://brianhanson.com'
      AND author_name = 'Brian Hanson'
      AND site_name = 'Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'This content belongs only to the Brian Hanson owner site';
  END IF;

  SELECT slug, status, checkout_mode, external_url,
    jsonb_build_object('body', body, 'summary', summary, 'external_button_text', external_button_text)
    INTO current_slug, current_status, current_checkout_mode, current_external_url, current_content
  FROM public.offers WHERE id = target_id FOR UPDATE;
  IF NOT FOUND OR current_slug IS DISTINCT FROM 'pushten'
    OR current_status IS DISTINCT FROM 'published'
    OR current_checkout_mode IS DISTINCT FROM 'external'
    OR current_external_url IS DISTINCT FROM 'https://go.aiforbusiness.com/get-pushten'
  THEN
    RAISE EXCEPTION 'Expected published external PushTen offer is missing or has changed';
  END IF;
  IF current_content IS NOT DISTINCT FROM desired_content THEN
    RAISE NOTICE 'PushTen copy and images already present; no update needed';
    RETURN;
  END IF;
  IF current_content IS DISTINCT FROM original_content THEN
    RAISE EXCEPTION 'PushTen copy has changed; inspect before applying';
  END IF;

  UPDATE public.offers
    SET body = desired_content->>'body',
        summary = desired_content->>'summary',
        external_button_text = desired_content->>'external_button_text'
    WHERE id = target_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one PushTen update, got %', changed;
  END IF;
END $update_pushten$;

-- Only public copy is assigned. The existing trigger also advances updated_at.
COMMIT;
