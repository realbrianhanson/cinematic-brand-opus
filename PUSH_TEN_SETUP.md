# PushTen Setup Guide

How to turn this template into your own authority site. Written for PushTen
members. You do not need to write code to complete it.

Permission note: this template is provided for use by PushTen members on their
own sites. It carries no public open-source license, and this document does not
grant one. If you are unsure whether your use is covered, ask PushTen.

---

## 1. The one-shot rebrand prompt

Remix the project into your own workspace first (Section 2), then paste this
into the chat and fill in the bracketed parts. Leave a line out entirely rather
than inventing an answer.

```
Rebrand this site for me. Create a new preset in src/config/presets/ based on
src/config/presets/member.ts, point ACTIVE_PRESET in src/config/site.ts at it,
and update the site_settings row in the database to match.

Identity
- Name: [Your Name]
- Role / title: [e.g. Consultant & Speaker]
- Tagline: [3-5 words, e.g. Operations · Hiring · Growth]
- Logo initials: [1-3 letters]
- Site URL: [https://yourdomain.com]
- Contact email: [you@yourdomain.com]
- Topics I want to be known for: [3-6 topics]

Homepage copy
- Hero headline (2-4 short lines): [...]
- Hero sub-line (1-2 sentences): [...]
- Primary button label and link: [...]
- Secondary button label and link, or "none": [...]
- Proof badges, only things that are literally true, or "none": [...]
- Story timeline entries (tag, when, 1-2 sentences each), or "skip section": [...]
- Expertise cards (title + 1-2 sentences each), or "skip section": [...]
- Result numbers (number, label, one-line detail), or "skip section": [...]
- Event section details, or "skip section": [...]
- Speaking topics and booking link, or "skip section": [...]
- Newsletter heading and intro: [...]
- Privacy policy URL, or "none yet": [...]
- Terms URL, or "none yet": [...]

Rules
- Do not invent metrics, awards, testimonials or client names. If I did not
  give you a number, leave it out and hide the section.
- Keep the existing visual design (dark background, serif headings, gold accent)
  unless I ask otherwise.
- Skip any section I marked "skip section" by setting it to false in `sections`.
- Leave legal links out if I said "none yet" — never link to a page that
  does not exist.
```

---

## 2. Member checklist

Work top to bottom. Nothing later works properly if an earlier step is skipped.

**A. Get your own copy**
- [ ] Remix this project into your own workspace. A remix copies the **code**
      only. It does not copy the original site's database rows, uploaded media,
      subscribers, secrets or connected domain.
- [ ] Confirm your remix has its own backend (Lovable Cloud). Each project gets
      its own database, so nothing you do can touch the source site.

**B. Make yourself the admin**
- [ ] Sign up on your own site's `/admin` login with your email.
- [ ] Ask in chat: "give my account the admin role". Do this before anything
      else — the admin area is closed until you have it.

**C. Core settings**
- [ ] Admin > Settings: site name, site URL, author name, title, bio, credentials.
- [ ] Calls to action: headline, sub-text, button text, destination URL.
- [ ] Voice profile and banned phrases (the wording rules every draft must follow).
- [ ] Industries (the niches your content targets) — deactivate the ones that
      do not apply and add your own.
- [ ] Content schemas (the page formats) — keep, rename, or disable.
- [ ] Widgets: which extras appear in sidebars and the footer.

**D. Public config**
- [ ] Run the rebrand prompt in Section 1, or edit your preset file directly.
- [ ] Check the homepage: nothing should mention anyone but you.

**E. Email**
- [ ] Connect your own mail provider credentials in Project Settings > Secrets.
      Ask in chat which secret names the project expects; do not guess values.
- [ ] Set the newsletter from-address, reply-to, and postal mailing address in
      Admin > Settings. The postal address is legally required for bulk email in
      many countries, and sending is blocked until the mail settings are complete.
- [ ] Verify your sending domain with your mail provider.
- [ ] Send a test to yourself before switching the weekly digest on.

**F. Branding and media**
- [ ] Replace the hero background video and its poster image in `public/videos/`,
      or ask for the video removed entirely.
- [ ] Replace the portrait and event photo in `src/assets/`.
- [ ] Replace the browser icon.
- [ ] Adjust the accent colour in your preset if you want a different palette.

**G. Turn on the content engine (only when the above is done)**
- [ ] Add your news and research sources in Admin.
- [ ] Set the daily publishing cap (the template ships conservative: 3/day).
- [ ] Leave automatic publishing off until you have reviewed several drafts
      by hand and are happy with the voice.

**H. Launch**
- [ ] Connect your domain in Project Settings > Domains.
- [ ] Publish.
- [ ] Check the homepage, one article, `/sitemap.xml` and `/rss.xml` on the
      live domain.
- [ ] Submit your sitemap in Google Search Console.

---

## 3. Clean-install path (what the database should start with)

Every historical migration in `supabase/migrations/` was reviewed. What is in
there:

- Schema: tables, access rules, validation triggers, helper functions. Safe and
  required on a fresh install.
- Neutral seeds: the content formats (schemas), a starter settings row, and a
  starter list of public news feeds.
- A handful of **content patches** written for the original site: removing a
  city name from old copy, fixing link formatting in old articles, and inserting
  the original settings rows. These are harmless on an empty database — they
  update rows that do not exist yet — but they are not something you need.

What is **not** in the migrations, and must never be added to them:

- No subscriber lists, private notes, or article content.
- No admin/user role assignments. You create your own admin (Step B).
- No hardcoded automation secret. The scheduling secret is read at runtime from
  the project's own secure store.
- No scheduled-job definitions. Automation is opt-in per project.

So the safe order for a fresh install is: apply the schema, keep the neutral
seeds, create your own admin, fill in your own settings, then switch automation
on deliberately. **Never re-run the original site's scheduling migrations
against another project's backend.**

---

## 4. Keeping the public config and the database aligned

Two places hold "who this site is", on purpose:

| Where | Drives | Edited by |
| --- | --- | --- |
| `src/config/presets/*.ts` | Everything a visitor reads on the homepage, navigation, footer, and the default page titles and social previews | You or the chat, in code |
| `site_settings` in the database | Article generation, publishing, feeds, newsletter sending, structured data on generated pages | Admin > Settings, in the browser |

They must agree on four values: **site name, site URL, author name, contact /
sender email**. If they drift, visitors see one name while emails and feeds use
another.

Rule of thumb: change it in Admin > Settings first, then ask in chat to "sync
my public config to the settings I just saved". The rebrand prompt in Section 1
does both at once.

