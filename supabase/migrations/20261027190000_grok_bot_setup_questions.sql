-- Grok Bot setup application, round two from Brian:
-- - The first question asks what they'd hand to a Grok Bot first, in plain
--   jobs, instead of naming the central brain
-- - New question: do they have a website, and its address if they do
-- - Pricing starts at $1,000 (was $997)
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'grok-bot-setup';
  IF f.id IS NULL THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{questions}', $q$[
  {
    "id": "handoff",
    "help": "Pick the one that would free up the most time",
    "type": "single",
    "label": "What would you hand to a Grok Bot first?",
    "options": [
      {
        "id": "follow-up",
        "label": "Following up with leads and customers"
      },
      {
        "id": "inbox",
        "label": "Answering emails, texts and messages"
      },
      {
        "id": "content",
        "label": "Writing posts, emails and other content"
      },
      {
        "id": "research",
        "label": "Research, reports and competitor checks"
      },
      {
        "id": "admin",
        "label": "Scheduling, admin and paperwork"
      },
      {
        "id": "not-sure",
        "label": "Not sure yet. I want ideas"
      }
    ],
    "required": true
  },
  {
    "id": "grok",
    "help": "",
    "type": "single",
    "label": "Where are you with Grok Bots today?",
    "options": [
      {
        "id": "not-started",
        "label": "Haven't started yet"
      },
      {
        "id": "few",
        "label": "I've set up one or two"
      },
      {
        "id": "weekly",
        "label": "I use them every week"
      }
    ],
    "required": true
  },
  {
    "id": "offer",
    "help": "A sentence or two is plenty",
    "type": "textarea",
    "label": "What do you sell, and who buys it?",
    "options": [],
    "required": true
  },
  {
    "id": "website",
    "help": "",
    "type": "single",
    "label": "Do you have a website for your business?",
    "options": [
      {
        "id": "yes",
        "label": "Yes"
      },
      {
        "id": "no",
        "label": "Not yet"
      }
    ],
    "required": true
  },
  {
    "id": "website-url",
    "help": "",
    "type": "text",
    "label": "What's your website address?",
    "options": [],
    "required": true,
    "showWhen": {
      "questionId": "website",
      "optionId": "yes"
    }
  },
  {
    "id": "tasks",
    "help": "List the jobs you'd hand to a bot first",
    "type": "textarea",
    "label": "What eats the most time in your week?",
    "options": [],
    "required": true
  },
  {
    "id": "style",
    "help": "You can decide on the call",
    "type": "single",
    "label": "How do you want to work with us?",
    "options": [
      {
        "id": "with-you",
        "label": "Done with you: we build it together and you learn to run it"
      },
      {
        "id": "for-you",
        "label": "Done for you: our team builds it and hands it over"
      },
      {
        "id": "not-sure",
        "label": "Not sure yet"
      }
    ],
    "required": true
  },
  {
    "id": "budget",
    "help": "Pricing starts at $1,000",
    "type": "single",
    "label": "What budget have you set aside for this?",
    "options": [
      {
        "id": "under-1000",
        "label": "Under $1,000"
      },
      {
        "id": "usd-1000-2500",
        "label": "$1,000–$2,500"
      },
      {
        "id": "usd-2500-5000",
        "label": "$2,500–$5,000"
      },
      {
        "id": "usd-5000-plus",
        "label": "$5,000+"
      },
      {
        "id": "not-sure",
        "label": "Not sure yet"
      },
      {
        "id": "tight",
        "label": "Funds are tight, but I'm resourceful"
      }
    ],
    "required": true
  },
  {
    "id": "start",
    "help": "",
    "type": "single",
    "label": "How soon do you want to start?",
    "options": [
      {
        "id": "asap",
        "label": "As soon as possible"
      },
      {
        "id": "within-30-days",
        "label": "Within 30 days"
      },
      {
        "id": "one-to-three-months",
        "label": "In 1–3 months"
      },
      {
        "id": "researching",
        "label": "Just researching for now"
      }
    ],
    "required": true
  },
  {
    "id": "phone",
    "help": "So we can reach you about your application and call",
    "type": "text",
    "label": "Best mobile number",
    "options": [],
    "required": true
  }
]$q$::jsonb);
  cfg := jsonb_set(cfg, '{invitation,description}', to_jsonb(replace(cfg #>> '{invitation,description}', '$997', '$1,000')));
  cfg := jsonb_set(cfg, '{alternative,intro}', to_jsonb(replace(cfg #>> '{alternative,intro}', '$997', '$1,000')));
  cfg := jsonb_set(cfg, '{preparation,extras,objections,items}', (
    SELECT jsonb_agg(jsonb_set(item, '{answer}', to_jsonb(replace(item ->> 'answer', '$997', '$1,000'))) ORDER BY n)
    FROM jsonb_array_elements(cfg #> '{preparation,extras,objections,items}') WITH ORDINALITY AS t(item, n)));
  IF cfg = f.draft_config THEN RETURN; END IF;
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
