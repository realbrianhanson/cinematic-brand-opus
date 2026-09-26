import {
  emptyPage,
  newSection,
  type OfferPage,
  type OfferRecipeContext,
  type OfferSection,
} from "./offerBuilder";

export type OfferBlueprintPageRole =
  "invitation" | "preparation" | "membership";

type OfferBlueprintStage = {
  id: string;
  title: string;
  kind: "page" | "provider";
  description: string;
  pageRole?: OfferBlueprintPageRole;
};

export const qualifiedCallBlueprint = {
  id: "qualified-call-membership",
  title: "Qualified Call + Membership",
  description:
    "Invite visitors to a fit conversation, prepare those who book, and offer an optional membership path when a call is not the right next step.",
  stages: [
    {
      id: "invitation",
      title: "Short video invitation",
      kind: "page",
      pageRole: "invitation",
      description:
        "Explain the situation, approach and fit before linking to your qualification form.",
    },
    {
      id: "qualification",
      title: "Qualification form",
      kind: "provider",
      description:
        "Configure your external form and branching rules: suitable applicants continue to scheduling; others can explore the membership.",
    },
    {
      id: "qualified-calendar",
      title: "Qualified calendar",
      kind: "provider",
      description:
        "Configure scheduling for suitable applicants, with timezone, availability and cancellation instructions.",
    },
    {
      id: "booking-confirmation",
      title: "Booking confirmation",
      kind: "provider",
      description:
        "The scheduling provider confirms an actual booking. An abandoned, failed or cancelled booking must not display a success claim.",
    },
    {
      id: "preparation",
      title: "Conversation preparation",
      kind: "page",
      pageRole: "preparation",
      description:
        "Provide a preparation video and next steps after the provider confirms a booking. Applying this page does not verify a booking or track video completion.",
    },
    {
      id: "membership",
      title: "Optional membership path",
      kind: "page",
      pageRole: "membership",
      description:
        "Offer a useful alternative for visitors who are not ready for a call, with clear inclusions and subscription terms.",
    },
    {
      id: "subscription-checkout",
      title: "Subscription checkout",
      kind: "provider",
      description:
        "Configure your own recurring billing checkout, disclosures, cancellation and access delivery with the provider.",
    },
  ] satisfies OfferBlueprintStage[],
  qualificationQuestions: [
    "What are you working on, and what would you like to change?",
    "What is the main obstacle you want help with?",
    "What have you already tried, and what did you learn?",
    "Which parts of this approach seem relevant to your situation?",
    "When would you be ready to begin, and what time can you set aside?",
    "Who else needs to be involved in deciding the next step?",
    "Is a conversation useful now, or would you prefer to explore the membership?",
  ],
  setupChecklist: [
    "Create separate draft offers for the invitation, preparation and membership pages; applying a layout edits only the current page.",
    "Add your own video, reviewed copy and approved evidence. No media, testimonials, prices or guarantees are supplied.",
    "Configure the external qualification form, consent notice and explicit fit rules; these templates do not collect answers or create branches.",
    "Connect the qualified branch to your scheduling provider and the optional alternative branch to your membership page.",
    "Let the provider verify booking success before showing confirmation; test failed, abandoned, cancelled and rescheduled bookings separately.",
    "Configure preparation links and any reminders in the provider. No email, video-completion tracking or automatic cancellation is enabled here.",
    "Use your own verified subscription checkout URL and complete billing, renewal, cancellation, refund and access disclosures before publication.",
    "Test both routes on mobile and desktop, including consent and analytics. A provider handoff is not proof of a booking or payment.",
  ],
};

const layouts: Record<
  OfferBlueprintPageRole,
  { type: OfferSection["type"]; heading: string }[]
> = {
  invitation: [
    { type: "video", heading: "A closer look at the approach" },
    { type: "problem", heading: "The obstacle worth solving" },
    { type: "method", heading: "A way to move forward" },
    { type: "benefits", heading: "What this could help you do" },
    { type: "proof", heading: "Evidence behind the approach" },
    { type: "faq", heading: "Before you decide" },
    { type: "cta", heading: "Explore the fit" },
  ],
  preparation: [
    { type: "video", heading: "Prepare for a useful conversation" },
    { type: "method", heading: "The approach in context" },
    { type: "deliverables", heading: "What the offer includes" },
    { type: "faq", heading: "Questions before a conversation" },
    { type: "cta", heading: "Your next step" },
  ],
  membership: [
    { type: "benefits", heading: "What membership could help you do" },
    { type: "deliverables", heading: "Inside the membership" },
    { type: "method", heading: "How the approach comes together" },
    { type: "proof", heading: "Evidence you can review" },
    { type: "faq", heading: "Before you join" },
    { type: "cta", heading: "Explore membership" },
  ],
};

const ctaText: Record<OfferBlueprintPageRole, string> = {
  invitation: "See whether this is a fit",
  preparation: "Review the next steps",
  membership: "See membership details",
};

const limited = (value: string | undefined, maximum: number) =>
  (value || "").trim().slice(0, maximum);

/** A page layout only: no provider configuration or private brief material. */
export function blueprintPage(
  role: OfferBlueprintPageRole,
  context?: OfferRecipeContext,
): OfferPage {
  const supplied: Partial<Record<OfferSection["type"], string>> = {
    problem: limited(context?.strategy.problem, 6000),
    method: limited(context?.strategy.mechanism, 6000),
    benefits: limited(context?.strategy.outcome, 6000),
    deliverables: limited(context?.strategy.deliverables, 6000),
  };
  return {
    ...emptyPage(),
    headline: limited(context?.offer.title, 300),
    subheadline: limited(context?.offer.summary, 1000),
    ctaText: ctaText[role],
    focusMode: true,
    sections: layouts[role].map(({ type, heading }) => ({
      ...newSection(type),
      heading,
      body: supplied[type] || "",
    })),
  };
}

/** Private planning material, deliberately separate from public page copy. */
export function blueprintWorkbook(): string {
  return `# Qualified Call + Membership workbook

An original, editable planning framework. Replace bracketed fields with your own verified offer information. This workbook does not create pages, forms, calendar rules, payments, emails or tracking. Applying a page layout updates only the selected page in the current offer. Save separate draft offers for the invitation, preparation and membership pages, then connect them with your own providers.

## 1. Offer and fit brief

- Offer name: [name]
- Audience and situation: [specific situation this offer addresses]
- Problem: [observable obstacle]
- Intended outcome: [supported outcome, with limitations]
- Method: [how the work happens]
- Call purpose and scope: [what the conversation covers and does not cover]
- Included support, resources and access: [verified inclusions]
- Suitable now: [objective fit criteria and readiness requirements]
- Better served by another option: [which needs this offer cannot address]
- Evidence cleared for publication: [approved proof, source and permission]
- Page owner and review date: [owner] / [date]

Use evidence only after review. Do not invent results, testimonials, earnings, scarcity, guarantees or price comparisons. Private strategy notes, objections and ad messages are not approved public proof.

## 2. Branch and route inventory

| Stage | Owned destination | Entry and exit rule | Setup owner |
| --- | --- | --- | --- |
| Short video invitation | [invitation offer URL] | CTA opens the external qualification form | [owner] |
| Qualification form | [form provider URL] | Submitted answers evaluated against the documented rules below | [owner] |
| Qualified calendar | [scheduling provider URL] | Suitable applicants select a time; opening the calendar does not mean booked | [owner] |
| Booking success | [provider confirmation destination] | Show confirmed status only after a verified successful booking | [owner] |
| Conversation preparation | [preparation offer URL] | Provider-confirmed bookings receive this link through the configured provider flow | [owner] |
| Optional membership | [membership offer URL] | Visitor chooses this alternative when a call is not the next step | [owner] |
| Subscription checkout | [your provider checkout URL] | Payment provider presents full terms and collects recurring-payment consent | [owner] |
| Subscription success and access | [provider success/access destination] | Verified payment or subscription status determines access under the stated terms | [owner] |
| Incomplete or cancelled action | [return/retry destination] | Offer a neutral way to retry, review details or leave; do not show success | [owner] |

Primary route: invitation → qualification → qualified calendar → provider-confirmed booking → preparation video.

Alternative route: qualification → optional membership page → provider subscription checkout → verified subscription/access flow.

An incomplete form stays incomplete. A not-yet-fit answer can offer membership without enrolling, charging or booking anyone. If neither offer is appropriate, provide a polite exit. These are separate external routes; a native post-purchase upsell is not the qualification branch.

## 3. Short video invitation script

Use this original script framework as a starting point. The timing is editorial guidance, not a required duration.

### Opening: situation and relevance (about 20 seconds)

“If you are [audience in a specific situation] and [observable obstacle] is getting in the way, this is a short introduction to [offer or method]. I will explain the approach and how to decide whether a conversation would be useful.”

### Problem: recognize the obstacle (about 30 seconds)

“The challenge we focus on is [problem]. You may already have tried [verified common attempts]. The part we look at first is [specific constraint], because [supported explanation].”

### Method: make the process concrete (about 60 seconds)

“Our approach has [actual number] parts: [step], [step] and [step]. In practice, that means [concrete example]. The intended outcome is [supported outcome]. What is possible depends on [relevant limits and responsibilities].”

### Evidence and fit (about 40 seconds)

“You can review [approved demonstration or evidence] to understand the work. This is designed for [fit criteria]. It may not suit [scope limits]. [Relevant evidence context and limitations.]”

Omit this evidence passage until suitable proof exists. An empty proof section is preferable to a fabricated result.

### Invitation and optional alternative (about 30 seconds)

“If you would like to explore whether this fits your situation, the next step is a short form. Based on your answers, [describe the actual configured route or review process]. If a conversation is not the right next step, you can also review [membership name] and decide whether it is useful to you.”

Button: “See whether this is a fit.” Link it to your own tested qualification form. Do not promise a response time or a booking before those operations are configured.

## 4. Qualification questions and decision rules

${qualifiedCallBlueprint.qualificationQuestions.map((question, index) => `${index + 1}. ${question}`).join("\n")}

Ask only for information necessary to assess fit and contact the applicant. State why it is collected, where it is handled, the applicable privacy notice and any optional marketing consent. Do not silently bundle marketing consent into a scheduling request.

For a premium business offer, select the additional inputs that actually affect fit:

- Business model and offer: [what they sell and whom they serve]
- Typical offer value: [price or customer value, with currency and period]
- Current lead and customer volume: [relevant volume over a defined period]
- Acquisition activity: [channels in use, what is working and any relevant budget range]
- Near-term priority: [specific improvement they want and why now]
- Implementation capacity: [available time, team and resources]

Choose only relevant inputs, allow an “unsure” answer where appropriate, and document your own eligibility rules. A high price or budget alone does not establish fit. Do not inherit another business's financial thresholds or present an optional membership as a required purchase.

| Decision input | Rule to configure | Result |
| --- | --- | --- |
| Need matches scope | [specific answers that fit the service] | Continue evaluating |
| Readiness and capacity | [clear, relevant threshold with a review option] | Eligible for scheduling or optional alternative |
| Decision participation | [who needs to attend or approve] | Scheduling instructions or manual review |
| Preference | [visitor requests membership or does not want a call] | Optional membership or exit |
| Ambiguous or incomplete answer | [manual review process and actual response expectation] | No automatic claim of qualification |
| Outside both offers' scope | [documented mismatch] | Respectful exit; no forced purchase |

Define every threshold before launch. Do not infer suitability from protected or unrelated personal characteristics. Record the rule version and test representative answers. No scoring, branching or manual review is implemented by applying these page layouts.

Suggested positive alternative copy, to adapt to your actual offer:

“A call may be more useful at a later stage. If you would like to explore [accurate membership benefit], you can review the membership details here. Joining is optional, and you are welcome to return when your needs change.”

Do not describe the visitor as a failure, invent a rejection reason or imply that joining is required to earn a call.

## 5. Scheduling and booking outcomes

- Calendar configuration: [provider], [timezone handling], [duration], [availability], [buffers], [attendees].
- Verified booking signal: [authenticated provider event or provider-controlled confirmation]. A visit to a success URL alone is not verification.
- Confirmed booking: show accurate date, time, timezone, meeting access and rescheduling/cancellation instructions through the configured provider. Then offer preparation.
- Failed or abandoned booking: explain that a booking has not been established and provide a retry or return route.
- Cancelled booking: show cancelled status only when the provider confirms it; offer the configured rescheduling path.
- Rescheduled booking: use the current provider appointment; avoid stale dates and duplicate reminders.
- Confirmation email and reminders: [provider and tested settings]. Do not claim an email was sent without a real delivery action and appropriate status evidence.

The preparation template does not verify appointment status. Keep any public preparation page neutral so direct visitors do not see an unsupported “booking confirmed” claim. This builder does not create calendar appointments, enforce eligibility or send scheduling messages.

## 6. Preparation video and next steps

Video outline: explain [call purpose]; introduce [method]; identify [materials that would help]; set [scope and expectations]; explain [how to reschedule or cancel through the provider]. Use your own approved video URL and an accessible text equivalent.

Preparation checklist:

- [Useful context the attendee can gather]
- [Questions they would like to discuss]
- [Any participants who should attend]
- [How to review appointment details in the provider]

Button: “Review the next steps.” Set its destination to the actual next-step resource or provider page and test it.

A page visit, video embed load or play click is not proof that someone watched the full video. Video completion requires separately configured player events and a reliable identity association, with appropriate consent. The template does not enable video-completion tracking, reminders, attendance enforcement or automatic cancellation. Do not cancel an appointment because preparation was supposedly not completed without a separately implemented, disclosed and tested policy with a way to resolve tracking errors.

## 7. Membership page and subscription disclosures

Membership page outline: useful benefits → exact inclusions → how participation works → approved evidence → questions and terms → optional checkout decision.

Explain the membership on its own merits. Make clear whether it includes personal support, live sessions, recordings, a community or other resources only when those are actually provided. Do not imply that membership guarantees later call eligibility or a business result.

Button: “See membership details.” Use the external provider mode and your own active HTTPS checkout destination when connecting the membership page to a subscription. A native one-time offer does not become a subscription by applying this template. Verify the price display and button label against the provider's actual checkout before publication.

Complete and verify all of these fields on the membership page and at checkout:

| Disclosure | Your verified terms |
| --- | --- |
| Seller identity | [business/legal seller name] |
| Plan and inclusions | [plan name, resources, support limits, eligibility] |
| Currency and recurring charge | [currency] [amount] per [billing interval] |
| Initial payment and total due | [amount due today, setup fees and other required charges] |
| Taxes | [whether included or calculated, and where final total appears] |
| Trial or introductory period | [none, or duration, initial charge, end date and exact post-trial amount] |
| Renewal | [automatic renewal terms, charge timing and billing cadence] |
| Minimum commitment | [none, or term, payment count and total obligation] |
| Cancellation method | [working self-service route or actual support process] |
| Cancellation deadline | [when a cancellation must arrive to avoid the next charge, including timezone] |
| Cancellation effect | [when billing stops and when membership access ends] |
| Refund policy | [eligibility, exclusions, timing and request process] |
| Pauses and plan changes | [whether available, effective dates and proration rules] |
| Failed payments | [retry process, notices, grace period and access consequences] |
| Access delivery | [where, when and how access is supplied after the provider verifies eligibility] |
| Support | [your working support contact or support page and actual availability] |
| Terms and privacy | [your current terms URL] and [your privacy URL] |
| Consent | [clear recurring-payment agreement presented before purchase] |

Do not publish bracketed placeholders. Do not copy a third party's checkout, contact details, prices, trial terms or cancellation promises. An unavailable reference checkout provides no evidence of current terms. Verify your own checkout end to end, including subscription management and cancellation.

## 8. Flow QA before launch

- Preview and save each separate page; verify that every public claim is supported and all unknown placeholders are removed.
- Test mobile and desktop layout, readable copy, keyboard access, form labels, video captions/text alternatives and link destinations.
- Test matching, not-yet-ready, membership-preference, outside-scope, ambiguous and incomplete qualification answers.
- Test calendar availability, timezone changes, successful booking, abandoned booking, provider error, cancellation and rescheduling.
- Open the preparation URL directly and verify it does not claim a booking, email delivery or completed video viewing.
- Test the membership route without a booking; joining stays optional and a visitor can leave.
- Test subscription checkout success, declined payment, abandoned checkout, duplicate return, renewal, failed renewal and cancellation using the provider's test facilities.
- Verify billing disclosures, consent, actual amount and interval, receipts, access delivery, refunds and cancellation against provider behavior.
- Confirm that a handoff click never creates a local booking, order, payment or completion claim by itself.
- Check expired or unavailable destinations, form/provider outages, retry routes and a working support path.
- Verify analytics consent, permitted cross-domain attribution and removal of personal form answers from analytics payloads and URLs.
- Record [tester], [date], [device], [scenario], [expected outcome], [observed outcome] and [remaining issue]. Publish only after unresolved launch blockers are addressed.

## 9. Measurement plan and operating review

The rows below are measurement requirements to configure and verify, not events enabled by these templates. Document each actual provider event name, owner, consent basis and deduplication key.

| Desired measure | Required evidence | Limitation |
| --- | --- | --- |
| Invitation interest | Page view and CTA handoff | Handoff is not a submitted form |
| Qualification completion | Accepted form submission from the provider | Do not count a form page visit as completion |
| Qualified vs alternative route | Recorded rule decision with rule version | Missing answers are not a rejection |
| Booking conversion | Verified scheduling event and stable booking ID | Calendar views and return URLs are insufficient |
| Attendance/cancellation | Provider or operator attendance and cancellation records | Booking does not prove attendance |
| Preparation engagement | Configured player events with permitted identity association | A page view or embed load does not prove completion |
| Membership interest | Membership page view and checkout handoff | Checkout handoff is not a sale |
| New paid membership | Verified paid/subscription event with stable provider ID | A success-page view is insufficient; distinguish trials |
| Renewal, cancellation and refund | Verified provider lifecycle events | A cancellation request may have a later effective date |

Define each rate's denominator and period: invitation-to-form, form-to-qualified, qualified-to-booked, booked-to-attended, alternative-to-membership, checkout-to-paid and retained memberships. Use unique identifiers to avoid double counting retries, reschedules and duplicate events. Report unknown or unavailable data explicitly.

Review [cadence] with [owner]. Inspect branch fairness and clarity, calendar availability, provider errors, supported claims, membership cancellations and unanswered questions. Improve the relevant step based on verified behavior without treating untracked activity as failure.
`;
}
