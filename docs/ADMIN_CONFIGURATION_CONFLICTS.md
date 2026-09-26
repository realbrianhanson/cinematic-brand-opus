# Admin configuration save protection

Widgets, Site setup, redirects and content offer assignments now save against the version the administrator actually loaded. An older tab cannot quietly overwrite a newer tab's configuration, and editing a deleted assignment cannot recreate it. Errors leave the edited values available. Loading a saved copy is a deliberate action with a discard confirmation when edits would be lost.

## Behavior

- Widget configuration still saves after a short typing pause. Saves are serialized per widget. The draft keeps its original version across background refreshes; only a confirmed save advances that version. After a failed or uncertain write, automatic retries stop. Retry uses the same version; Reload saved replaces the draft only after confirmation and a successful read. Pending and failed drafts remain protected across zone switches, refreshes and removal of the saved row.
- Site setup captures both `site_branding.updated_at` and `site_settings.updated_at`. The new `admin_save_site_branding` checks both under locks before applying the existing validated branding write and history snapshot. A change through either Site setup or Site Config rejects an older setup draft. The existing member-brand confirmation and owner-mode preservation rules remain in force.
- Redirect update/delete calls include both ID and the loaded `updated_at`, and every write must return exactly one affected row. A zero-row edit keeps its form open with an actionable error. Visit counters do not invalidate a redirect's edit version.
- Content offer assignments distinguish create from edit. New assignments use insert and report uniqueness conflicts; edits and removals use ID plus the original version. Successful edits return a fresh version for the next save. Unpublished/funnel-only offers remain unavailable through the existing database validation.
- Internal navigation is blocked during a save. Unsaved drafts prompt before navigating away, and the browser warns when closing or reloading the tab. Changes stay only in the current editor session; no sensitive admin draft is added to browser storage.

## Deployment contract

Apply `20260927100000_admin_configuration_conflicts.sql` before releasing the new frontend. It adds one administrator-only RPC and monotonic edit-token triggers. There are no configuration/data backfills, new public read surfaces, or weaker row-level policies. The deployed old frontend can continue calling `save_site_branding(jsonb)` while preview is reviewed; old clients do not acquire the new optimistic-concurrency behavior until updated.

New RPC:

```text
admin_save_site_branding(
  _value jsonb,
  _expected_branding_updated_at timestamptz,
  _expected_settings_updated_at timestamptz
) -> jsonb { saved: true, branding_updated_at, settings_updated_at }
```

Pass null for an absent branding row (and for a legacy null settings timestamp). Conflict code is `40001`. The new function preserves the existing `save_site_branding` validation and private history snapshots. Its table locks also serialize singleton creation and concurrent legacy writes. Admin writes to widgets, branding, settings, offer assignments and redirect configuration always advance `updated_at`, including successive writes within a single transaction. Redirect usage-only writes keep the configuration version unchanged.

## Verification

`node scripts/tests/admin-configuration-conflicts-database.mjs` runs against isolated PGlite fixtures only. It verifies stale two-tab updates, changed/deleted rows, create uniqueness, no deleted-row resurrection, private history, old-client compatibility, admin grants/RLS, settings-side changes, usage counters and monotonic timestamps. Focused component tests verify loaded-version predicates, conflict/draft preservation, explicit reload cancellation, autosave timeout recovery and navigation protection.
