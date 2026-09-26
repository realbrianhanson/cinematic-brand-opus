# Native checkout extras and decline alternatives

An offer can include one optional paid native extra in the same currency. The visitor explicitly checks the extra before checkout. A free primary offer with a paid extra requires payment for the combined basket. The admin’s **Next step** panel configures the extra independently from the follow-up and the optional alternative shown after declining it.

Publication validates these relationships atomically with the offer document. Private drafts and revisions retain the new settings without changing the live offer. Publishing a source requires its extra to be published; archiving the extra later hides it and blocks new selections. Follow-ups and alternatives only appear while their target is published and native. The preview shows disabled forms, the purchased-extra file state, and both decline stages without creating orders or contacting payment or email providers.

## Reservation and payment

`offer_reserve_order` accepts an optional `_bump_offer_id`. One reservation creates the existing `offer_orders` row plus immutable `offer_order_items`: one `primary`, optionally one `bump`. The order amount is the exact sum; each item stores its original title, price, currency, and private file. The access token is bound to the selected basket. Reusing it with a different selection is rejected, and a successful replay returns the original snapshots even if the catalog changes.

The Stripe adapter creates one line per snapshotted item, checks the sum and currency before calling the provider, and retains the existing order/attempt idempotency key. The existing signed webhook verifies the combined amount and currency before fulfillment. No saved-card, off-session, or one-click payment is implemented. Checkout recovery retains the original item snapshots while checking the prior payment attempt is terminal and unpaid.

The narrow `offer_public_bump` projection exposes only the published extra’s descriptive catalog fields and price. It does not expose private asset paths, private drafts, or the source’s full commerce configuration.

## Private access and delivery

One private order capability opens every item in its basket. Status returns safe item names and prices; downloading a selected item requires that item to belong to the fulfilled order. Storage paths never enter public status responses. Each signed download URL lasts five minutes. An already-issued signed URL can remain usable until it expires.

The existing delivery outbox and email recovery issue an access link to the order, which now lists every purchased file. No extra email is queued per item. Any verified refund event, including a partial refund, conservatively revokes new download access to the entire basket. Snapshots remain for history and reconciliation. This feature does not initiate refunds; refunds are performed in the payment provider.

Historical orders have no item backfill and retain their original single-file fallback. Migration does not rewrite old orders, reset deadlines, or queue historical customer emails.

## Decline and alternative

Orders snapshot both the original follow-up and alternative IDs. Decline requests include the offer the visitor saw. The first decline sets `upsell_declined_at`; it exposes the alternative without setting terminal `declined_at`. Repeating that same request cannot accidentally decline the alternative. Declining the alternative ends the invitation.

Both branches share the original fulfillment deadline. Parent-row locking and the existing unique parent-order constraint permit only one child reservation across the branches. Once a child exists, another acceptance or decline cannot replace it. The original basket stays available after either decline. Each accepted paid follow-up opens a separate checkout; an extra’s own follow-up configuration does not run merely because it was bought as an extra.

## Verification

Run `node scripts/tests/offer-bumps-downsells-database.mjs` for isolated database checks covering immutable basket totals, token replay, private/public boundaries, atomic draft/publish behavior, decline idempotency, the single-child rule, deadline preservation, historical fallback, and refund revocation. Native backend, access HTTP, visitor journey, editor state, publish-diff, and preview tests cover actual adapters and rendered behavior. These fixtures do not call payment or email providers.
