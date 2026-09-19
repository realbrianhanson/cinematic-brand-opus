# PushTen Setup Guide

How to turn this template into your own authority site. Written for PushTen
members. Use **Admin → Site setup** to rebrand without editing source code. Advanced homepage sections can still be customized directly in GitHub.
An assistant can perform the setup steps; verify the destination is your own copy.

Permission note: this template is provided for use by PushTen members on their
own sites. It carries no public open-source license, and this document does not
grant one. If you are unsure whether your use is covered, ask PushTen.

---

## 1. Guided setup (recommended)

First complete the separate-backend and administrator steps in Section 2.
Then open **Admin → Site setup** and choose **Fresh member brand**. Enter your
name, niche, domain, headline, bio, accent color, logo/favicon URLs, and main
offer. Upload images through **Media library** and paste their public URLs.
Use a new favicon filename when changing it so cached icons update.

The final step previews your homepage and provides a launch checklist.
**Apply site setup** updates public branding and author/publishing identity
atomically. It does not change private provider credentials, create a domain,
copy subscribers, or enable sending. The fresh member option hides the owner's
personal photos, testimonials, claims, verification token, and external offers.
Do not use it to convert the owner's populated site into your installation.

Changes are database-backed and rendered on the server. For extra sections,
edit a neutral member preset directly in GitHub. Keep factual proof limited to
what you can substantiate.

### Optional advanced rebrand brief

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

- [ ] Remix this project into your own workspace. A Cloud remix copies **code and database schema**, but not records, users,
      secrets, custom domains, connected integrations or the GitHub connection.
      Referenced public media may still be owner-specific: replace those assets.
- [ ] Verify the remix has its own Cloud backend and that its public environment
      URL points to that backend before using the admin or running setup.
- [ ] Run `setup/member-bootstrap.sql` in the **empty remix** Cloud SQL editor.
      It refuses populated databases and existing active scheduled jobs. It seeds
      neutral settings and one guide format, with automated publishing, reports
      and paid image generation disabled. Re-running it does not overwrite edits.
      Existing speaking inquiries also block setup, including when a copied
      bootstrap marker is present. Speaking inquiry intake starts disabled; enable
      it in **Admin → Speaking inquiries** only when you are ready to monitor it.

**B. Make yourself the admin**

- [ ] In your remix's Cloud **Users** panel, create/invite your own account and
      complete the invitation/password setup. `/admin/login` is a login page;
      it does not offer public registration.
- [ ] Copy that account's user ID, then use the remix's SQL editor to explicitly
      grant it the admin role:

Use this SQL with the user ID you just verified:

```sql
insert into public.user_roles(user_id,role)
values ('YOUR-VERIFIED-USER-UUID'::uuid,'admin')
on conflict (user_id,role) do nothing;
```

Replace the placeholder with your own verified account ID. Never make the
first public visitor an administrator. Sign in at `/admin/login`.

**C. Core settings**

- [ ] Admin > Site setup: identity, niche, domain, colors, images, author bio, and main offer.
- [ ] Admin > Brand & author: remaining credentials, public links, voice, and email configuration.
- [ ] Calls to action: headline, sub-text, button text, destination URL.
- [ ] Voice profile and banned phrases (the wording rules every draft must follow).
- [ ] Industries (the niches your content targets) — deactivate the ones that
      do not apply and add your own.
- [ ] Content schemas (the page formats) — keep, rename, or disable.
- [ ] Widgets: which extras appear in sidebars and the footer.

**D. Public config**

- [ ] Complete Admin > Site setup and review its preview. Use a source preset only for advanced custom sections.
- [ ] Check the homepage: nothing should mention anyone but you.
- [ ] Add only your own testimonials. The optional `homepageTestimonials` block in your preset accepts a quote, attribution, and context for each item; leave it absent or empty until you have real feedback. Brian's six homepage testimonials are excluded from the member preset. See [testimonial setup](docs/TESTIMONIALS.md).

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
- [ ] Add your own favicon to `public/` and set `metadata.faviconHref` in your preset. Replace `public/favicon.ico` too (browser fallback). For saved home-screen shortcuts, add a 180px PNG and set `metadata.appleTouchIconHref`. Use new filenames when changing icons so browsers refresh cached branding.
- [ ] Replace the browser icon.
- [ ] Adjust your accent color in Site setup.

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

## 3. Supported installation path

Use a **Lovable Cloud remix** of the source project, which copies its complete
current schema. The historical SQL directory is an upgrade history, not a
verified fresh-install baseline: some tables were provisioned outside those
files, and historical migrations contain source-site configuration. Do not
replay that directory into a fresh database or copy the owner's scheduling setup.

`setup/member-bootstrap.sql` adds neutral records to an empty remixed schema.
It creates no accounts, role assignments, schedules, subscribers, public content
or provider secrets. It does not enable newsletter sends. Set up your own
credentials and review each automation before enabling it.

Source project: [Brian Hanson Authority](https://lovable.dev/projects/aad54f9f-2dc1-4e99-9396-88f3e07eb70c).
Public remixing was verified enabled on September 17, 2026. Anyone with that link
can remix; this is not a paid-membership access gate. Editor access remains
separate. See [Lovable's remix documentation](https://docs.lovable.dev/features/projects/remix).

The bootstrap is tested on an isolated schema fixture. A newly provisioned Cloud
remix still needs its own end-to-end launch check; no production copy was created
or populated as a QA side effect.

---

## 4. Keeping the public config and the database aligned

Two places hold "who this site is", on purpose:

| Where                           | Drives                                                                                                          | Edited by                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `src/config/presets/*.ts`       | Everything a visitor reads on the homepage, navigation, footer, and the default page titles and social previews | You or the chat, in code         |
| `site_settings` in the database | Article generation, publishing, feeds, newsletter sending, structured data on generated pages                   | Admin > Settings, in the browser |

They must agree on four values: **site name, site URL, author name, contact /
sender email**. If they drift, visitors see one name while emails and feeds use
another.

Rule of thumb: change it in Admin > Settings first, then ask in chat to "sync
my public config to the settings I just saved". The rebrand prompt in Section 1
does both at once.

## 5. Navigation, policies, and downloads

The neutral member preset includes Shop and a Free Resources menu. Configure
`nav.items` to change their order or destinations; old `nav.links` configurations
still work. `/start-here` uses the active brand and actual catalog. Brian's worked
example, postal address, provider-specific policy copy, and starter-kit offer are
restricted to his installation.

Review `/privacy` and `/terms` against your own business practices, providers,
contact details, and purchase terms before launch. You can point the configured
footer policy links at your own policies instead. These starter pages are not
legal certification. `/support` uses your configured contact address and separates
website downloads from purchases delivered by external providers.

Native downloads support transactional access emails and private recovery links.
Configure your own verified sender and Resend credential; paid website checkout
also requires Stripe configuration. Review [download delivery](docs/OFFER_ACCESS_DELIVERY.md)
for retry controls and deployment order. A free claim never silently subscribes
someone to the newsletter. Never copy Brian's orders, grants, delivery records,
or private files into a member backend; the bootstrap checks reject inherited data.
