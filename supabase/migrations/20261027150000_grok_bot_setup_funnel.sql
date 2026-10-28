-- Grok Bot setup application: a second call funnel beside work-with-brian.
-- It starts from that funnel's config (brand, theme, booking calendar, consent)
-- and replaces the copy, questions and preparation with Grok Bot versions.
DO $$
DECLARE src public.call_funnels; cfg jsonb; fid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.call_funnels WHERE slug = 'grok-bot-setup') THEN RETURN; END IF;
  SELECT * INTO src FROM public.call_funnels WHERE slug = 'work-with-brian';
  IF src.id IS NULL THEN RETURN; END IF;
  cfg := src.draft_config || $j${
  "invitation": {
    "cta": "Apply for a Grok Bot strategy call",
    "video": {
      "url": "",
      "poster": "",
      "transcript": ""
    },
    "promise": "Bring the work that eats your week. Leave with a plan for which bots take it first",
    "audience": "For business owners ready to put Grok Bots to work",
    "headline": "Grok Bots built around your business, done with you or done for you",
    "ctaSubline": "About 3 minutes, then pick a time",
    "description": "First we set up your central brain, so ChatGPT, Claude and your Grok Bots all know your business. Then we interview you and build custom Grok Bot templates that automate the way you work. Pricing starts at $997",
    "reassurance": "On the call we look at how your business runs and pick the first bots to build. We'll tell you straight if we're a fit. No pressure either way",
    "watchPrompt": "Watch how we put Grok Bots to work",
    "proofHeading": "What people say about learning from Brian",
    "closingHeadline": "What do you want a Grok Bot to handle first?"
  },
  "application": {
    "intro": "A few quick questions so we show up to the call ready to help",
    "heading": "Apply for your Grok Bot setup",
    "privacyUrl": "/privacy",
    "consentText": "I agree to be contacted about this application and my call by phone, text message and email, using the details I provided. Message and data rates may apply. Reply STOP to opt out of texts"
  },
  "questions": [
    {
      "id": "help",
      "help": "Pick your top priority. We'll cover the rest on the call",
      "type": "single",
      "label": "Where do you want help first?",
      "options": [
        {
          "id": "brain",
          "label": "Set up my central brain so every AI tool knows my business"
        },
        {
          "id": "first-bots",
          "label": "Get my first Grok Bots working"
        },
        {
          "id": "custom",
          "label": "Custom Grok Bot templates built for my business"
        },
        {
          "id": "automate",
          "label": "Automate work I do by hand every week"
        },
        {
          "id": "not-sure",
          "label": "Not sure yet"
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
      "help": "A sentence or two is plenty. Add your website if you have one",
      "type": "textarea",
      "label": "What do you sell, and who buys it?",
      "options": [],
      "required": true
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
      "help": "Pricing starts at $997",
      "type": "single",
      "label": "What budget have you set aside for this?",
      "options": [
        {
          "id": "under-997",
          "label": "Under $997"
        },
        {
          "id": "usd-997-2500",
          "label": "$997–$2,500"
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
  ],
  "booking": {
    "url": "https://api.aiforbusiness.com/widget/booking/Bg5aHAQ5wqSFxT7BnBhX",
    "label": "Pick your call time",
    "agenda": "We'll look at how your business runs and pick the first Grok Bots to build. Then we walk through done with you and done for you",
    "minutes": 30
  },
  "preparation": {
    "intro": "Two minutes of prep means we spend the whole call on your business",
    "video": {
      "url": "",
      "poster": "",
      "transcript": ""
    },
    "extras": {
      "overview": {
        "url": "",
        "button": "Read the offer overview",
        "enabled": false,
        "heading": "Review the offer before we talk",
        "description": "See what's included and note anything you'd like to clarify"
      },
      "proofIds": [],
      "objections": {
        "intro": "Quick answers to the questions we hear most",
        "items": [
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "We look at your answers, dig into how your business runs and pick the first bots to build. If we're a fit, we walk you through scope, timeline and price",
            "enabled": true,
            "captions": "",
            "question": "What happens on the call?"
          },
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "It's one home for what AI needs to know about your business. Your offers, your voice, your customers and how you do things. ChatGPT, Claude and your Grok Bots all work from it, so you stop explaining your business in every chat",
            "enabled": true,
            "captions": "",
            "question": "What's the central brain?"
          },
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "Done with you means we build it alongside you, so you learn to run it yourself. Want it off your plate instead? Our team builds it and hands it over",
            "enabled": true,
            "captions": "",
            "question": "What's the difference between done with you and done for you?"
          },
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "Pricing starts at $997. You get your full quote after the call, so you know the price before you decide",
            "enabled": true,
            "captions": "",
            "question": "What does it cost?"
          },
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "No. Starting from scratch is fine. We set up your first bots with you and show you how to use them",
            "enabled": true,
            "captions": "",
            "question": "Do I need Grok Bot experience?"
          },
          {
            "video": {
              "url": "",
              "poster": "",
              "transcript": ""
            },
            "answer": "Your own Grok Bot account, logins for the tools we'll connect and quick feedback when we send work for review",
            "enabled": true,
            "captions": "",
            "question": "What do I need to provide?"
          }
        ],
        "enabled": true,
        "heading": "Before your call"
      },
      "proofHeading": "Experiences relevant to your next step"
    },
    "headline": "You're booked. Here's how to get the most out of the call",
    "checklist": [
      "Check your email for your calendar confirmation and meeting link",
      "Write down the 3 jobs you'd hand to a bot first",
      "Have your website or offer open so we can look at it together",
      "If you already use Grok Bots, have your account open so we can see your setup",
      "If a partner helps make the decision, invite them to join"
    ]
  },
  "alternative": {
    "cta": "Join the AI Summit",
    "faq": [
      {
        "answer": "Yes. Apply again anytime your budget or timeline changes",
        "question": "Can I still work with you later?"
      },
      {
        "answer": "No. It's the best place we know to start if a Grok Bot setup isn't the right fit today",
        "question": "Do I have to join the Summit?"
      }
    ],
    "url": "https://go.aiforbusiness.com/summit",
    "intro": "Our Grok Bot setups start at $997. If that's not the right fit today, this will get you moving on your own",
    "price": "Free",
    "story": "Most of what we build for clients, you can start building yourself with the right training. Start with the AI Summit, get your first wins and come back when you're ready for more",
    "video": {
      "url": "",
      "poster": "",
      "transcript": ""
    },
    "billing": "Three days, live online. Starting from scratch is fine",
    "benefits": [
      {
        "body": "See real examples of the tools and systems we build for clients",
        "title": "Learn what AI can do for your business"
      },
      {
        "body": "Start building with the same tools before you hire anyone",
        "title": "Get your first wins on your own"
      },
      {
        "body": "When you want us to build it with you or for you, apply again anytime",
        "title": "Come back when you're ready"
      }
    ],
    "headline": "The best place to start right now",
    "proofIds": []
  }
}$j$::jsonb;
  cfg := jsonb_set(cfg, '{training,intro}', to_jsonb('Get familiar with the approach before we talk about your business'::text));
  PERFORM public.call_funnel_config_validate(cfg, true);
  fid := gen_random_uuid();
  INSERT INTO public.call_funnels(id, slug, title, draft_config, version, published_version, active)
  VALUES (fid, 'grok-bot-setup', 'Grok Bot Setup Application', cfg, 1, 1, true);
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published)
  VALUES (fid, 1, 'grok-bot-setup', 'Grok Bot Setup Application', cfg, true);
END $$;

-- Work With Brian books through GHL now, so its prep checklist no longer
-- names Calendly or Zoom.
DO $$
DECLARE f public.call_funnels; cfg jsonb; v integer;
BEGIN
  SELECT * INTO f FROM public.call_funnels WHERE slug = 'work-with-brian';
  IF f.id IS NULL THEN RETURN; END IF;
  IF f.draft_config #>> '{preparation,checklist,0}' <> 'Check your email for the Calendly confirmation and Zoom link' THEN RETURN; END IF;
  cfg := jsonb_set(f.draft_config, '{preparation,checklist,0}', to_jsonb('Check your email for your calendar confirmation and meeting link'::text));
  PERFORM public.call_funnel_config_validate(cfg, true);
  v := f.version + 1;
  UPDATE public.call_funnels SET draft_config = cfg, version = v, published_version = v, updated_at = now() WHERE id = f.id;
  INSERT INTO public.call_funnel_revisions(funnel_id, version, slug, title, config, published) VALUES (f.id, v, f.slug, f.title, cfg, true);
END $$;
