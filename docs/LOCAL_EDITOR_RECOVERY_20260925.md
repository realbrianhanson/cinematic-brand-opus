# Device recovery for editorial drafts

Guide, resource and news editors now preserve unsaved editable fields on the current device. They wait for the saved document to hydrate, then offer an explicit Restore/Discard choice after a reopen. Restore changes only the on-screen form; saving, publishing and existing quality gates remain explicit actions.

## Scope and version safety

- Storage keys and validated envelopes include both the authenticated account ID and the document type/ID. Every mounted editor uses a unique instance slot, so simultaneous tabs never autosave over each other's working copies. Legacy shared-key backups remain discoverable. The editor must be reopened if the signed-in account changes in place. A late save callback for another document cannot clear its backup.
- Restorable fields are allowlisted by strict per-editor schemas. Row IDs, `updated_at`, source relationships, scores, roles and settings credentials never enter restored state.
- Each backup records the exact original editable-field baseline and, where available, the authoritative server version. A different baseline or version blocks direct restore and offers a JSON download for comparison and manual reconciliation. Resources retain their existing optimistic-concurrency guard and published-URL protection. News items do not have an `updated_at` column; their original editable-field snapshot provides the reopen comparison.
- When a save completes, only this instance's matching submitted snapshot is removed. Source slots from other instances are retained; discovery hides copies matching the authoritative saved document. Undoing every change removes only this editor instance's exact obsolete backup.
- Several recovered copies produce an explicit chooser. Restore and Discard re-read the chosen record and refuse stale actions when that record changed or disappeared. A restore writes to a fresh instance slot, preserving both the source and any typing done while choosing. New edits continue to receive their own backup while recovery is pending.
- Discard writes a separate, unique dismissal marker; it never deletes another instance's source. New records have a unique write ID so only the selected revision is hidden. A later revision written by the original tab remains discoverable. Legacy records use their exact raw version for dismissal compatibility.

## Storage behavior and limits

This is device-only recovery, separate from the post editor's existing account recovery. It makes no database calls, requires no migration, never changes public content and does not cache settings secrets. Browser storage denial/quota errors show a visible warning without blocking editing or saving. The serialized envelope is capped at 2,000,000 characters. Clearing browser data or using a different device removes access to these backups; this is not a cross-device revision archive.

Retained source slots and dismissal markers consume browser storage. Automatic cleanup deliberately does not delete another instance's data because a read/remove comparison cannot be atomic across tabs. Matching saved copies are hidden, and storage exhaustion remains a visible, recoverable warning rather than risking another editor's newer work.

Existing leave warnings remain in the guide/resource editors. Explicitly discarding news edits removes only the matching working snapshot. Unsaved local edits are not evidence that a save or publication succeeded.

## Verification

Tests cover hydration, opt-in restore, stale-version blocking, account/document isolation, unknown-field rejection, denied/full storage, exact-snapshot cleanup, newer edits during a save, another tab's replacement copy, undo cleanup and reopening the actual guide/resource/news editors. The implementation needs no live data mutations or paid services for these checks.
