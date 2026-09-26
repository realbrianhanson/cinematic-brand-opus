# First AI Build: local recovery and print

The free `/first-ai-build` planner now saves progress in the same browser and offers a complete print/PDF layout. No new backend, payment provider, paid generation, dependency, email requirement, or measurement event is involved.

## Recovery contract

- Read browser storage only after mount. Server rendering starts without saved data and never reads a visitor’s saved answers.
- Use a planner-specific key scoped to the loaded brand preset, canonical site URL and identity name. Browser origin additionally isolates production, preview, and other sites. Changing the brand identity remounts the session; it cannot reuse the previous brand’s screen state.
- Save bounded answers synchronously as the visitor edits. Keep exact in-progress text, selected project, audience choice, last valid generated inputs, and whether they were editing or viewing the plan. Rebuild the result from the matching playbook version; do not store generated HTML or a remote response.
- The envelope and playbook are independently versioned, with strict field/enum validation, a 6,000-character record bound, 120-character text fields, and seven days of availability after the last edit. Future/contradictory timestamps and a result inconsistent with its inputs are rejected. Expired records are removed on the next visit, not by a background service.
- Returning visitors explicitly choose **Resume saved progress** or **Start over**. Merely loading a page never overwrites an existing copy. Restoring progress does not record a second plan-created event. Malformed/unsupported versions require explicit clearing rather than silently disappearing.
- Before each write, compare the currently stored record with this tab’s last known record. If another tab changed it, preserve the current form in memory, stop writing, and explain that the visitor should download/print before leaving. This detects intervening writes; browser localStorage does not provide a cross-tab transactional lock.
- Storage denial, quota errors, and clearing failures stay visible. The planner remains usable in memory and exports stay available. A failed clear does not claim the stored copy was removed. Start over asks for confirmation and removes only this brand’s planner key, never unrelated browser data.
- Explain the scope, seven-day availability, shared-browser visibility, and removal option beside the planner. Stored answers are not encrypted, account-linked, or synchronized. They are never added to URLs, analytics, newsletter requests, or other APIs. Existing optional continuation sends only the existing bounded project enum.

## Print / Save as PDF

A print-only React portal renders a separate white document with deep ink text, green section markers, readable type, and print page margins. It includes the personalized overview, scope, deferred features, screens, full fictional example, complete build prompt, acceptance checks and next steps. The prompt starts on a new page, remains selectable text and wraps long content. User text is rendered by React as literal text.

During printing, the rest of the application is hidden: navigation, admin/chat overlays, controls, optional training, and newsletter forms. Screen styling and dark mode are unchanged. Print styles apply only while this planner document exists. Native browser print (including keyboard Print) uses the same document when a result is open. The normal **Download full plan** Markdown export and clipboard/manual-copy fallback remain available.

The print action opens the browser print dialog; the user chooses a destination such as **Save as PDF**. The page never claims that a PDF was saved or that printing completed. If printing throws or is unavailable, show the download/browser-command fallback. The browser controls page size, headers/footers, destination, and final pagination.

## Verification

Meaningful regression tests cover expiring and malformed records, bounded data, scope/version isolation, partial edits versus prior results, cross-tab write conflicts, unavailable storage, explicit restore, reset confirmation/cancellation, unrelated-key preservation, print document completeness, print failure, existing download/copy behavior, and absence of sensitive answers in analytics. Browser review should additionally check both themes, narrow widths, reload/return recovery, a generated PDF’s complete prompt, and the absence of site chrome from the printed output.
