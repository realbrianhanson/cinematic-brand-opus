# Private resource and guide version history

Resources and guides now retain the previous saved row when their title, URL, content, SEO metadata, status or content grouping changes. The two private history tables keep the latest 20 before-images per document. View counts, quality scoring and timestamp-only writes do not produce revisions. History starts with the migration; it does not reconstruct overwritten material from before deployment. Deleting a document cascades to its history.

Administrators can open Saved versions, compare escaped plain text against the current working draft, inspect saved source links and download a JSON copy. Loading a version requires explicit confirmation and changes only title, content and complete SEO metadata in the unsaved editor. It does not restore IDs, URL, status, scores, override flags or timestamps. The existing Save and publication gates still apply. Both editors retain unknown SEO keys and source metadata on subsequent saves and include that metadata in device recovery.

The timestamp records when the before-image was captured. `change_source` distinguishes a signed-in change from a system change, with an optional actor ID for private auditing. Neither label means a person fact-checked or approved the content. Links are references saved with that version, not a new evidence endorsement.

## Database protection

`20260925130000_editorial_history.sql` creates `generated_page_revisions` and `pillar_page_revisions`. Admin RLS permits reads; authenticated clients cannot insert, update or delete revision rows. Definer triggers insert complete old rows and trim to 20 while the source row is locked. Failed updates roll back their history too. Source tables' existing content/publication protections remain active.

Guide saves now compare the exact loaded `updated_at` in their update predicate and reject zero matches. A dedicated timestamp trigger issues a fresh, strictly increasing token for every guide update. The publication-override RPC requires the timestamp returned by the preceding save, locks that guide, checks the expected version and only then records the override and publishes. The new admin uses a distinct `_v2` RPC. The legacy three-argument RPC remains for the currently published admin, with hardened identity checks and a row lock. It retains status-only publication behavior but cannot compare a client version; old tabs do not gain the new conflict protection. Null/unauthenticated identities fail closed in both APIs.

Deploy the additive migration before the updated admin frontend. The existing published admin remains compatible while the new frontend is available only in preview. No public page publishing is triggered by this migration or by viewing/loading history. Backend migration and frontend release are both required.

## Remix isolation

The empty-remix bootstrap refuses inherited resource/guide revisions, GSC import metadata/rows and checkout attempts even if an existing neutral bootstrap marker is present. It preserves those records and stops before seeding another owner's configuration.

## Validation

The database suite covers admin-only reads, denied direct mutation, complete snapshots including unknown SEO, system/signed-in actor labels, meaningful-change filtering, retention, failed-write rollback, stale guide updates and version-checked override publication. Component coverage exercises opt-in queries, safe links/plain text, explicit confirmation, JSON export, document mismatch rejection, source preservation and loading historical content without restoring publication authority. Browser/provider generation and production writes are not part of these local checks.
