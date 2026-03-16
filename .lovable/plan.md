

## Problem

When you click "Preview" on a generated page, it opens the public URL `/resources/{type}/{niche}`. But the `GeneratedPage` component queries for pages with `status = 'published'`. Since your pages are still in `draft` status, the query returns nothing and the page stays stuck on "Loading..." forever.

## Fix

Two changes:

### 1. `src/pages/GeneratedPage.tsx` — Show draft pages for admins
Update the query to not filter by `status = 'published'` when the page is being previewed. Instead, fetch the page regardless of status, and optionally show a "Draft" banner at the top so you know it's not live yet.

Alternatively (simpler): remove the `.eq("status", "published")` filter from the query entirely and instead show a visual indicator for non-published pages. The RLS policy already handles visibility — admins can see all statuses, public users can only see published.

### 2. `src/pages/GeneratedPage.tsx` — Fix the infinite loading state
Change the loading/not-found logic so that when the query finishes but returns `null`, it shows a "Page not found" message instead of "Loading..." forever. Currently it shows "Loading..." for both the loading state AND the not-found state.

### Files changed
- **`src/pages/GeneratedPage.tsx`**: Remove `.eq("status", "published")` from the query (RLS handles access control). Add proper loading vs not-found states. Add a "Draft" banner when `status !== 'published'`.

