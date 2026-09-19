# Offers and funnels

Open **Admin → Growth → Offers & funnels**. Each offer can use **Website checkout / download** or an **External / affiliate link**. Free downloads and external links work without this site's Stripe keys. You can prepare paid website downloads now; their purchase button stays unavailable until Stripe's server credentials are configured.

## Build an offer

1. Select **New offer**, then add the title, short summary, landing-page copy, and optional HTTPS cover image.
2. For **Website checkout / download**, upload the downloadable file: PDF, ZIP, EPUB, or plain text, up to 25 MB. Files are private. Uploads use a new versioned path so replacing a file does not change past customers' downloads. For a product or checkout hosted elsewhere, choose **External / affiliate link** and follow the instructions below.
3. Choose free or a one-time price in USD, CAD, EUR, GBP, or AUD. External paid offers can instead show **View current pricing**. Save as a draft and use **Preview** to check the page without creating an order or opening its external destination.
4. Publish when ready and share the `/offers/your-slug` link. Drafts and archived pages are not publicly available.

## Include selected offers in the Shop

The site's **Shop** link opens `/shop`, a searchable catalog for trainings, resources, tools, and courses. In each offer editor, choose a category and enable **Show in Shop** if you want people to find that offer while browsing. **Feature in Shop** moves it ahead of other listings. Free and paid items appear together, with price filters and clear prices. Cards lead to the offer's detail page. Website downloads keep their existing opt-in, checkout, and follow-up flow; external listings have a button that opens the saved destination.

An offer appears only after it is published and explicitly listed. Existing offers start unlisted. Leave campaign pages unlisted to keep them out of the catalog and Shop sitemaps; their direct links continue to work. This setting does not make a published page private. Funnel-only offers cannot be listed because they require a qualifying earlier offer. Archiving removes a listing without taking downloads away from existing customers.

## Link to an external product or affiliate offer

1. Choose **External / affiliate link** under **Checkout or delivery method**. Paste the full HTTPS destination, including any affiliate or campaign parameters. Your own sales page, a Stripe Payment Link, or a third-party product page can be the destination.
2. Add an optional button label such as **View workshop**. Leave it empty to use the default button text. No private file, website Stripe credentials, or delivery message is required.
3. Set the offer to free or paid. For a stable price, select **Show a specific price** and enter the amount. For changing promotions, subscriptions, or several pricing plans, select **View current pricing on destination**. That listing remains in the Shop's paid filter and never displays a zero-dollar price.
4. Enable **This is an affiliate link** when you may earn a commission. The public offer page displays a disclosure beside the outbound button. Add your own wording or leave it empty for the standard disclosure; the destination link is also marked as sponsored.
5. Publish the offer and optionally enable **Show in Shop**. Check that the destination and any referral parameters are correct. Keep any displayed fixed price current with the destination page.

External checkout, opt-ins, delivery, refunds, and upsells happen on the destination site. Clicking an external link does not create a website lead, order, or download entitlement, so those transactions do not appear in **Orders & leads** here. External listings are standalone: they cannot be a website download funnel's follow-up or have one. If an existing offer is referenced by a current funnel or a previous order's saved follow-up, create a separate external listing instead. Saving a method change clears incompatible settings; already fulfilled website orders retain their original download snapshots.

## Add an upsell or timed follow-up

For website checkout/download offers, create the follow-up offer first, then select it as the next offer on your initial offer. Only website checkout/download offers can be selected. Enable **Funnel-only** on a follow-up if it should require a valid preceding download or purchase. You may set a time window (30 minutes to 7 days) or leave it without a timer.

The timer begins when the original offer is fulfilled. It limits when the customer can start the next checkout; an already started checkout has its own expiry. Each paid offer requires a separate explicit checkout. No saved card is charged automatically. A customer can claim one follow-up per original order, and declining it does not remove the original download. The system prevents circular funnels and limits a chain to ten offers.

Published follow-ups must have a file and complete copy. An unpublished follow-up is hidden. Existing orders retain their original price, file, and next-offer selection even if the offer changes later. Archive an offer to stop new orders; retain its uploaded files for existing customers.

## Connect Stripe later

No Stripe key belongs in the frontend, GitHub, this offer editor, or a `VITE_` variable. Configure these **server-side secrets** in the project's cloud settings:

- `STRIPE_SECRET_KEY` — start with your Stripe test secret key.
- `STRIPE_WEBHOOK_SECRET` — the signing secret for the webhook endpoint below, from the same Stripe environment/account.

Webhook endpoint for this project:

`https://pwjdotliwsulqktavyxf.supabase.co/functions/v1/offer-stripe-webhook`

Subscribe the endpoint to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded`. The webhook uses Stripe's official SDK to verify the signed raw request and checks the paid amount/currency against the saved order before unlocking a file. Any refund revokes future download access; previously downloaded files cannot be recalled.

Open the **Stripe setup** tab and refresh configuration. “Configured” means the secrets are present; it does not mean a payment has been tested. Before collecting money, verify a complete test checkout, duplicate webhook delivery, cancellation, and refund using Stripe test mode, then switch both credentials and the webhook to live mode. Confirm your Stripe business settings and any tax requirements separately; this implementation does not calculate sales tax, offer subscriptions, or apply discount codes. Product and price records are created from the saved offer when a checkout begins, so no Stripe product IDs are required in the editor.

## Delivery and leads

Customers receive a download on their confirmation page. They can copy a private access link for later. Anyone with that link can access the resource, so keep it private. A file download uses a link valid for five minutes; the saved access page can issue another while the order remains fulfilled.

The **Leads & orders** tab records free opt-ins and paid checkout states. Emails are self-reported, not verified. This feature does not automatically email files or enroll anyone in the newsletter. Pending, failed, expired, and refunded orders are not counted as fulfilled purchases. Do not treat a browser redirect as proof of payment.

## Sharing this theme

Member copies need their own database migrations, private `offer-files` bucket, `offers-api` and `offer-stripe-webhook` functions, canonical HTTPS site URL, administrator account, and (only when selling through the website's checkout) Stripe account secrets and webhook. External destinations do not require this site's Stripe credentials; their checkout must be configured at the destination. The readiness panel shows the webhook URL for that installation. Offer copy, files, pricing, destination links, affiliate disclosures, and funnels are editable in admin and do not require code changes. Do not copy the original site's customer data or private files into a member installation.
