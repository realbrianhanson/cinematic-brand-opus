# PushTen Authority Site

A personal authority website with a built-in content engine: research-backed
article drafting, quality gating, internal linking, structured data, feeds, a
double opt-in newsletter, and an admin area to run it all.

New here as a PushTen member? Start with **[PUSH_TEN_SETUP.md](./PUSH_TEN_SETUP.md)**.

---

## Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start v1 (file-based routing, server functions) |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/ui, lucide icons |
| Build | Vite 7 |
| Rendering | Server-side rendered on every request, so crawlers receive real HTML |
| Backend | Lovable Cloud (Postgres with row-level security, auth, storage, functions) |
| Data fetching | TanStack Query |
| Tests | Vitest |

Routes live in `src/routes/`. Public HTTP endpoints (feeds, newsletter links,
webhooks) live under `src/routes/api/`. Longer-running content pipelines run as
backend functions in `supabase/functions/`.

---

## Local setup

```bash
bun install
cp .env.example .env   # fill in your own project's public values
bun run dev            # http://localhost:8080
```

`.env` holds only public, browser-safe values (project reference, API URL,
publishable key). Private keys — mail provider, A.I. providers, service
credentials — are stored in Project Settings > Secrets and are never committed.

## Commands

```bash
bun run dev          # dev server with hot reload
bun run build        # production build
bunx vitest run      # test suite
bunx tsgo --noEmit   # typecheck
```

---

## Configuration

**Public presentation** — `src/config/`:

- `types.ts` — the shape of a site config, with validation that fails loudly on
  a bad URL, a trailing slash, an enabled-but-empty section, or an unsafe link.
- `presets/brian.ts` — the live site.
- `presets/member.ts` — a blank starting point with no borrowed proof.
- `site.ts` — picks the active preset and exposes helpers.

Homepage components read from this config only. There are no names, metrics,
photos, emails or campaign links hardcoded in components.

**Operational settings** — the `site_settings` row in the database, edited in
Admin > Settings. Drives generation, publishing, feeds and email. See
[PUSH_TEN_SETUP.md](./PUSH_TEN_SETUP.md), "Keeping the public config and the
database aligned".

---

## Features

**Content engine**
- Research-backed drafting with live search grounding and competitor snapshots
- Voice enforcement: a critique-and-revise pass plus a banned-phrase linter
- Quality gate: drafts below the configured score, or under the word floor,
  cannot publish; the database enforces it, not just the UI
- Originality check against the source corpus and existing articles
- Fact-check pass with remediation before publishing
- Automatic social preview images
- Internal linking: topic-cluster links plus contextual in-body links
- Drip scheduling with a daily cap instead of same-day bulk publishing
- Automatic freshness refresh, with hand-edited articles left alone

**Discovery**
- Server-rendered pages, unique titles and descriptions per route
- Structured data for articles, FAQs, breadcrumbs and lists
- `/sitemap.xml`, `/rss.xml`, `/llms.txt`, `/llms-full.txt` generated live
- Search Console performance feedback that prioritises slipping pages

**Newsletter**
- Double opt-in, durable per-address and per-IP rate limiting
- Bounced and complained addresses are never reactivated by a public sign-up
- Weekly digest with a preview-and-approve step and single-send protection
- Sending fails closed when mail configuration is incomplete

**Admin**
- Article, page and media management, live pipeline queue, performance dashboard

---

## Deployment

Publish from the Lovable editor, then connect your domain in
Project Settings > Domains. Because pages are rendered on the server, search
engines and A.I. crawlers get complete HTML from the hosting platform — no proxy
or extra service is needed.

**Note on the original site:** brianhanson.com is served through its own
Cloudflare zone and worker, deliberately. Do not reconnect or change that
domain's setup. Fresh member projects should use normal domain connection in
Lovable instead.

## Launch readiness

- [ ] Admin role assigned to your own account
- [ ] Site name, URL, author and sender email consistent between public config
      and Admin > Settings
- [ ] Mail provider credentials added, sending domain verified, postal address set
- [ ] Test newsletter received
- [ ] Homepage, one article, `/sitemap.xml` and `/rss.xml` all correct on the
      live domain
- [ ] Sitemap submitted to Search Console
- [ ] Daily publishing cap set; automatic publishing left off until drafts have
      been reviewed by hand
- [ ] Privacy and terms pages written and linked, or intentionally left off

## Known limitations

- Automatic publishing is only as good as the sources and voice rules you give
  it. Review drafts before trusting it unattended.
- Generation and research call paid A.I. and search services. Volume costs money;
  the daily cap is your main control.
- Article and page copy lives in the database, not in this repository, so it is
  not covered by code version history.
- The admin area is client-rendered and requires sign-in, so its first load is
  slower than public pages.
- Search Console reporting needs its own credentials per project and is off
  until you add them.
- Legal pages (privacy, terms) are not provided. Nothing is linked until you
  supply real URLs.
- Production builds fail if the project folder path contains an apostrophe
  (for example `.../Brian's Second Brain/...`). The framework's build-time code
  generators cannot handle it. Keep or copy the project in a folder path with
  no apostrophes before running `npm run build`. Development and tests are
  unaffected.
