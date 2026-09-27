import { useId } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Download,
  ExternalLink,
  GitBranch,
  Layers,
  ShoppingBag,
} from "lucide-react";
import { Link } from "@/lib/router-compat";

const choices = [
  {
    id: "sales",
    title: "Sell a product",
    description:
      "Build a sales page, take payment and deliver your digital product.",
    steps: ["Sales page", "Checkout", "Product access"],
    to: "/admin/offers/new?starter=sales",
    icon: ShoppingBag,
  },
  {
    id: "lead-magnet",
    title: "Give away a free download",
    description:
      "Collect an email address and give visitors your guide, checklist or other free resource.",
    steps: ["Opt-in page", "Email sign-up", "Download"],
    to: "/admin/offers/new?starter=lead-magnet",
    icon: Download,
  },
  {
    id: "call",
    title: "Book a call",
    description:
      "Use a video invitation and application to guide qualified prospects to your calendar.",
    steps: ["Video page", "Application", "Calendar"],
    to: "/admin/call-funnels",
    icon: CalendarDays,
  },
  {
    id: "external",
    title: "External checkout or registration",
    description:
      "Create the offer page, then send visitors to your checkout, webinar registration or affiliate destination.",
    steps: ["Offer page", "Your provider", "Provider follow-up"],
    to: "/admin/offers/new?starter=external",
    icon: ExternalLink,
  },
  {
    id: "upsell",
    title: "Upsell or downsell offer",
    description:
      "Create a follow-up product, then connect it to a parent offer. Paid follow-ups use a separate checkout.",
    steps: ["Parent offer", "Follow-up offer", "Checkout"],
    to: "/admin/offers/new?starter=upsell",
    icon: Layers,
  },
  {
    id: "branching",
    title: "Custom branching funnel",
    description:
      "Connect questions, content and existing offers. Let each visitor choose the path that fits.",
    steps: ["Question or content", "Chosen path", "Offer or resource"],
    to: "/admin/funnels",
    icon: GitBranch,
  },
];

export default function AdminFunnelBuilder() {
  const id = useId();
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 text-[hsl(var(--admin-text))] sm:p-8">
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Funnel builder
        </h1>
        <p className="text-lg">Choose what you want your funnel to do.</p>
        <p className="text-sm leading-relaxed text-[hsl(var(--admin-text-soft))]">
          Start with a goal below. Each choice opens the right builder with a
          starting layout you can make your own.
        </p>
      </header>

      <section
        aria-label="Choose a funnel type"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {choices.map(
          ({ id: choiceId, title, description, steps, to, icon: Icon }) => (
            <Link
              key={choiceId}
              to={to}
              aria-labelledby={`${id}-${choiceId}-title`}
              aria-describedby={`${id}-${choiceId}-description`}
              className="flex min-w-0 flex-col rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-5 text-inherit hover:border-[hsl(var(--admin-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[hsl(var(--admin-accent))] sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-4">
                <Icon
                  aria-hidden="true"
                  className="size-6 text-[hsl(var(--admin-accent))]"
                />
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 text-[hsl(var(--admin-text-soft))]"
                />
              </div>
              <h2
                id={`${id}-${choiceId}-title`}
                className="text-lg font-semibold leading-snug"
              >
                {title}
              </h2>
              <p
                id={`${id}-${choiceId}-description`}
                className="mb-6 mt-2 text-sm leading-relaxed text-[hsl(var(--admin-text-soft))]"
              >
                {description}
              </p>
              <ol
                aria-label="Visitor steps"
                className="mt-auto flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-[hsl(var(--admin-border))] pt-4 text-xs leading-relaxed text-[hsl(var(--admin-text-soft))]"
              >
                {steps.map((step, index) => (
                  <li key={step} className="inline-flex items-center gap-1">
                    {index > 0 && (
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3 shrink-0"
                      />
                    )}
                    {step}
                  </li>
                ))}
              </ol>
            </Link>
          ),
        )}
      </section>

      <section className="space-y-3" aria-labelledby={`${id}-connections`}>
        <h2 id={`${id}-connections`} className="text-base font-semibold">
          Want order bumps, upsells or downsells?
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-[hsl(var(--admin-text-soft))]">
          Open a product or download in Offers &amp; shop, then use its Order
          bump, upsell &amp; downsell section to connect your offers. You can
          build and save drafts now; taking payment through this site requires
          configured Stripe. External checkout and registration use your
          provider’s setup.
        </p>
      </section>

      <section
        aria-labelledby={`${id}-existing`}
        className="border-t border-[hsl(var(--admin-border))] pt-6"
      >
        <h2 id={`${id}-existing`} className="text-base font-semibold">
          Continue an existing funnel
        </h2>
        <nav
          aria-label="Manage existing funnels"
          className="mt-4 flex flex-wrap gap-3"
        >
          <Link to="/admin/offers" className="admin-btn-secondary">
            Products &amp; downloads
          </Link>
          <Link to="/admin/call-funnels" className="admin-btn-secondary">
            Call funnels
          </Link>
          <Link to="/admin/funnels" className="admin-btn-secondary">
            Custom branching funnels
          </Link>
        </nav>
      </section>
    </div>
  );
}
