## Goal
Move the live Brian Hanson project off the old React SPA stack and onto Lovable's TanStack Start SSR stack so members can remix it without needing a Cloudflare Worker. Reconnect `brianhanson.com` directly in Lovable and refactor public-facing edge functions into TanStack server functions.

## Why this is the right call
On TanStack Start, every public route renders full HTML on the server, so search/AI crawlers see content natively. The Cloudflare Worker that currently proxies bot traffic becomes optional. For a remixable member template, this removes the biggest external dependency.

## Important constraints
- **Cron jobs must stay on Supabase edge functions.** `pg_cron` invokes functions by name inside the Supabase project. Background jobs (`publish-scheduled-posts`, `check-content-freshness`, `daily-content-run`, `gsc-sync`, etc.) remain Supabase edge functions.
- **Public HTTP endpoints can move to TanStack server functions.** Bot renderer, feeds (`rss.xml`, `sitemap.xml`, `llms.txt`), and newsletter subscribe/confirm/unsubscribe endpoints become TanStack server functions so they serve from the same origin as the app.
- **The migration is reversible from chat history**, but it rewrites entry points, config, and the publishing pipeline. Plan for a focused block of work, not a quick toggle.

## Phase 1 — Preflight & snapshot
1. Confirm current project builds cleanly: `bun run build`.
2. Snapshot the current route table from `src/App.tsx`, auth wrappers, providers, custom `index.html` tags, `main.tsx` init code, and `vite.config.ts` plugins/aliases.
3. Inventory all `supabase/functions/*` and classify each as **public HTTP**, **cron/background**, or **shared helper**.
4. Verify the project is on an eligible Classic stack (Vite + React Router v6 + shadcn).

## Phase 2 — Framework migration (TanStack Start)
1. Run the built-in TanStack Start migration skill:
   - Swap framework scaffolding (`vite.config.ts`, `tsconfig.json`, entry files, Tailwind v4 setup).
   - Merge `package.json` and preserve custom scripts like `gen:types` if present.
   - Delete obsolete SPA files (`index.html`, `src/main.tsx`, `src/App.tsx`, etc.).
   - Generate `src/routes/` and `src/routes/__root.tsx` from the old route config, preserving `ProtectedRoute` and admin layout nesting.
   - Port custom theme tokens from `src/index.css` into the new `src/styles.css`.
2. Fix Tailwind v4 breaking patterns (arbitrary CSS variable syntax, shadow/rounded/blur scale names, ring defaults, outline/border colors).
3. Port `main.tsx` guards (chunk-reload recovery, lovable.app noindex injection) into `__root.tsx` or client-only lifecycle.
4. Port `PageHead.tsx` direct-DOM logic into TanStack `head()` where possible, or keep it as a client-only effect for dynamic route meta updates.
5. Run the three migration gates: `bun run build`, `bunx tsc --noEmit`, and SSR smoke test.

## Phase 3 — Edge function classification & migration
1. **Keep on Supabase (cron/background):**
   - `publish-scheduled-posts`
   - `check-content-freshness`
   - `refresh-stale-content`
   - `submit-indexnow`
   - `gsc-sync`
   - `weekly-report`
   - `daily-content-run`
   - `auto-publish-gate`
   - `manual-publish`
   - `backfill-post-embeddings`
   - `fact-check`
   - `draft-from-opportunity`
   - `cluster-opportunities`
   - `poll-sources`
   - `generate-content`, `generate-blog-post`, `generate-news-article`, `generate-pillar`, `generate-seo-aeo`
   - `compose-weekly-newsletter-preview`, `send-weekly-newsletter`
   - `remediate-post-facts`, `score-content-quality`
   - `resend-webhook`
   - Any other function triggered by `pg_cron` or Supabase Realtime/DB webhooks.

2. **Migrate to TanStack server functions (public HTTP):**
   - `render-page` → server function for crawler-ready HTML at any public path.
   - `rss` → server function at `/rss.xml`.
   - `generate-sitemap` → server function at `/sitemap.xml`.
   - `llms-txt` → server function at `/llms.txt` and `/llms-full.txt`.
   - `newsletter-subscribe`, `newsletter-confirm`, `newsletter-unsubscribe` → server functions under `/api/newsletter/*`.
   - Keep CORS handling and input validation intact during the move.

3. **Shared helpers:** `_shared/*` modules used by both Supabase and TanStack functions may need duplication or a shared package. Decide per module whether to keep a Supabase-only copy, a TanStack-only copy, or both.

## Phase 4 — Domain cutover
1. **Before migration:** note that `brianhanson.com` currently routes through your Cloudflare Worker. The Worker must be removed or bypassed before Lovable can serve the domain directly.
2. **In Lovable:** go to Project Settings → Domains and connect `brianhanson.com` and `www.brianhanson.com`.
3. **At Cloudflare:** remove the Worker route (or switch DNS from proxied to DNS-only) and set the A/TXT records Lovable provides.
4. **Wait for propagation** and verify both apex and www resolve to the Lovable-hosted SSR app.
5. Update `site_settings.site_url` and any hardcoded canonical URLs to `https://brianhanson.com`.

## Phase 5 — Post-migration verification
1. **Crawler rendering:** Request a public route with a Googlebot/ChatGPT user-agent and confirm full HTML is returned without the Cloudflare Worker.
2. **Feeds:** Verify `/sitemap.xml`, `/rss.xml`, `/llms.txt`, and `/llms-full.txt` return correct payloads.
3. **Admin auth:** Log in to `/admin` and confirm protected routes still gate correctly.
4. **Cron health:** Trigger one cron job manually and confirm 200 response; verify `pg_cron` still reaches Supabase edge functions.
5. **Build/typecheck:** Confirm `bun run build` and `tsc --noEmit` are clean.

## Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Migration fails mid-way and leaves the site broken | The migration is reversible from chat history; do the cutover in a focused session and keep the Cloudflare Worker in place until Lovable domain is verified. |
| `PageHead.tsx` DOM manipulation breaks SSR | Port critical meta tags into TanStack `head()`; keep dynamic updates client-only where necessary. |
| Tailwind v4 theme regressions | Audit every custom token and utility; record the port in `.lovable/migrate-to-tanstack/theme-port.json`. |
| Edge function dependencies (Deno/esm.sh) don't run in Nitro/TanStack | Public functions that move to TanStack may need `npm:` specifiers replaced with standard Node imports and CORS headers adjusted. |
| Cron jobs break because functions moved | Keep all cron/background functions on Supabase; only public HTTP endpoints move. |
| Custom domain downtime | Lower TTL before cutover; verify Lovable domain is Active before removing Cloudflare Worker route. |

## Out of scope (for this migration)
- Rewriting shadcn components.
- Changing the design system or color palette.
- Adding new features.
- Consolidating the duplicate toast/sonner setup.

## Recommended first step
Approve this plan, then I'll run the preflight build check and produce the detailed migration summary before touching any files.