# Grok Bot application → GoHighLevel

The `grok-bot-setup` call funnel sends two server-side JSON events to its own
GoHighLevel inbound webhook:

1. `contact_captured` after the visitor completes the contact step. This has
   `first_name`, `last_name`, `email`, and `phone`, so GHL can create the contact
   even if the visitor leaves before submitting the application.
2. `application_submitted` after the finished application is saved. This has
   the same contact details, `application_summary` in `QUESTION: answer` lines,
   and one value for each Grok Bot contact custom field. Single-choice answers
   use the displayed option label.

Both events use the private `GROK_BOT_GHL_WEBHOOK_URL` Edge Function secret.
Set it to a **Grok Bot application** inbound webhook URL for the **Ai for
Business** GHL subaccount. The URL ending in
`6cae6402-e310-4f07-8edc-4388a70a5aa5`, supplied by Mike, currently
belongs to the published **Brian Hanson - Agency App Webhook to Contact**
workflow. Its Create Contact action maps only first name, last name, email,
and phone; it stores `application_summary` in a contact note. A real Grok Bot
Setup Application submitted on October 28 reached that workflow and its full
question-and-answer block appears in the contact note. Its ten **Grok Bot
Application** contact fields are blank on that record. The same workflow also
handles the Agency & Consulting Application, and it does not map the Grok Bot
custom fields. Create a separate Grok workflow and use its URL for this secret
so agency application notifications and tags keep their existing behavior.
Do not put the URL in source, a `VITE_` variable, or the browser. If the secret
is absent, Grok Bot completed applications retain the existing global
`call_funnel_webhook_url` behavior, but first-contact events are not sent.

Deploy the migration `20261028143625_grok_bot_contact_crm.sql` and the updated
`call-funnel-api` and `call-funnel-mail` Edge Functions together. The submit
path sends immediately; the 15-minute worker retries failed contact and
application deliveries for 24 hours. The contact claim skips applications
already submitted, since the final event can create the contact itself.

## GHL workflow mapping

Use an **Inbound Webhook** trigger. A completed test application supplies a
sample containing every answer for mapping. Use the `event_type` value to
branch: `contact_captured` creates or updates the contact using its contact
details; `application_submitted` creates or updates the same contact using
email/phone and the fields below. Map only the contact details in the first
branch, so a late first-contact event cannot clear application answers.

| Inbound JSON key | GHL contact field |
| --- | --- |
| `grok_bot_first_task_to_hand_off` | Grok Bot: First task to hand off |
| `grok_bot_current_experience` | Grok Bot: Current experience |
| `grok_bot_business_and_buyers` | Grok Bot: Business and buyers |
| `grok_bot_has_website` | Grok Bot: Has website |
| `grok_bot_website_url` | Grok Bot: Website URL |
| `grok_bot_weekly_time_drains` | Grok Bot: Weekly time drains |
| `grok_bot_service_style` | Grok Bot: Service style |
| `grok_bot_budget` | Grok Bot: Budget |
| `grok_bot_start_timing` | Grok Bot: Start timing |
| `grok_bot_application_summary` | Grok Bot: Application summary |

The GHL fields above are **Contact** custom fields in the **Grok Bot
Application** folder. The standard `phone` field is separate from those ten
fields. The server sends the summary as both `application_summary` (for the
original webhook contract) and `grok_bot_application_summary` (for the contact
field).

After deployment, submit one test application with a unique email and check
that GHL has one contact with its phone, every answer in the matching field,
and the full summary. Also verify a contact-only test creates a contact, and
that another call funnel continues using its original global webhook.
