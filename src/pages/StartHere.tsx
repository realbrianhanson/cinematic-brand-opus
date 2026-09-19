import {
  ArrowRight,
  BookOpen,
  Download,
  Play,
  ShoppingBag,
} from "lucide-react";
import InformationPage from "@/components/InformationPage";
import WorkflowDemonstration from "@/components/WorkflowDemonstration";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { isBrianOwner } from "@/lib/informationPages";
import { Link } from "@/lib/router-compat";
import type { ShopOffer } from "@/lib/shop";

export default function StartHere({ offers }: { offers: ShopOffer[] }) {
  const config = useSiteConfig();
  const owner = isBrianOwner(config);
  const freeOffer = offers.find((offer) => offer.kind === "free");
  const event = config.sections.event ? config.event.cta : null;
  const steps = [
    {
      title: "Try one useful thing",
      description:
        "Start with a free guide and a task you already understand. Work through one example before adding more tools.",
      label: "Explore free resources",
      href: "/resources",
      icon: BookOpen,
    },
    ...(event
      ? [
          {
            title: "Learn with a demonstration",
            description: owner
              ? "Join the free 3-day AI for Business Summit for practical examples of tools, marketing, sales, and follow-up."
              : config.event.intro,
            label: event.label,
            href: event.href,
            icon: Play,
          },
        ]
      : []),
    {
      title: "Build on what works",
      description:
        "Explore the Shop when you know what you want to learn or build next. Each listing explains what is included and where to get access.",
      label: "Browse the Shop",
      href: "/shop",
      icon: ShoppingBag,
    },
  ];
  return (
    <InformationPage
      eyebrow="Start here"
      title={
        owner
          ? "One useful step beats another open tab."
          : "Find your next useful step."
      }
      intro={
        owner
          ? "You don’t need to learn every AI tool. Choose one task, follow a practical example, and check the result. Here are three ways to get moving."
          : `Explore the resources and training from ${config.identity.name}. Choose the path that fits what you want to do next.`
      }
      wide
    >
      {freeOffer && (
        <section className="grid gap-6 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/5 p-7 sm:p-9 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--brand-accent)]">
              <Download size={16} aria-hidden="true" />A free place to begin
            </div>
            <h2 className="mt-4">{freeOffer.title}</h2>
            <p className="mt-4 max-w-2xl text-white/75">{freeOffer.summary}</p>
          </div>
          <Link
            to={`/offers/${freeOffer.slug}`}
            className="inline-flex items-center justify-center gap-3 rounded bg-[var(--brand-accent)] px-6 py-4 font-semibold text-[var(--brand-backdrop)]"
          >
            Get the free resource <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      )}
      <div
        className={`grid gap-5 ${steps.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}
      >
        {steps.map(({ title, description, href, label, icon: Icon }, i) => (
          <section
            key={href}
            className="flex flex-col rounded-xl border border-white/15 p-7"
          >
            <div className="flex items-center justify-between text-[var(--brand-accent)]">
              <Icon size={22} aria-hidden="true" />
              <span className="text-xs tracking-widest">0{i + 1}</span>
            </div>
            <h2 className="mt-6">{title}</h2>
            <p className="mt-4 flex-1 text-white/75">{description}</p>
            <a
              href={href}
              data-conversion-destination={
                href === event?.href ? "summit" : undefined
              }
              data-conversion-placement="event"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-accent)] underline underline-offset-4"
            >
              {label}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </section>
        ))}
      </div>
      {owner && <WorkflowDemonstration />}
      <section className="border-t border-white/15 pt-9">
        <h2>Already have a resource?</h2>
        <p className="mt-4 text-white/75">
          Find your download or get help with a purchase on the{" "}
          <Link
            to="/support"
            className="text-[var(--brand-accent)] underline underline-offset-4"
          >
            support page
          </Link>
          .
        </p>
      </section>
    </InformationPage>
  );
}
