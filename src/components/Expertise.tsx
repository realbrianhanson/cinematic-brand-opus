import { Brain, Target, Code2, Users, ArrowUpRight } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
const ICONS = {
  brain: Brain,
  target: Target,
  code: Code2,
  users: Users,
} as const;
export default function Expertise() {
  const { expertise, event, sections } = useSiteConfig();
  return (
    <section
      id="expertise"
      className="bg-[var(--brand-backdrop)] py-20 lg:py-28"
    >
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 lg:grid-cols-[.85fr_1.15fr] lg:gap-24 lg:px-14">
        <header>
          <p className="mb-5 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
            {expertise.overline}
          </p>
          <h2 className="font-display text-4xl leading-[1.12] text-white lg:text-5xl">
            {expertise.headingLead}{" "}
            <em className="text-[var(--brand-accent)]">
              {expertise.headingAccent}
            </em>
          </h2>
          <p className="mt-6 font-body text-base leading-relaxed text-white/70">
            {expertise.intro}
          </p>
          {sections.event && event.cta && (
            <a
              href={event.cta.href}
              target={event.cta.external ? "_blank" : undefined}
              rel={event.cta.external ? "noopener noreferrer" : undefined}
              className="mt-7 inline-flex min-h-11 items-center gap-3 font-body text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline"
            >
              {event.cta.label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
        </header>
        <div className="grid gap-x-9 gap-y-10 sm:grid-cols-2">
          {expertise.cards.map((card) => {
            const Icon = ICONS[card.icon];
            return (
              <article
                key={card.title}
                className="border-t border-white/20 pt-6"
              >
                <Icon
                  size={25}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="mb-5 text-[var(--brand-accent)]"
                />
                <h3 className="font-display text-2xl leading-tight text-white">
                  {card.title}
                </h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-white/65">
                  {card.text}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
