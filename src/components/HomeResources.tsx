import { ArrowUpRight } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
export default function HomeResources() {
  const { featuredResources } = useSiteConfig();
  if (!featuredResources?.items.length) return null;
  return (
    <section
      id="resources"
      className="bg-[var(--brand-backdrop)] py-20 lg:py-28"
    >
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 lg:grid-cols-[.85fr_1.15fr] lg:gap-24 lg:px-14">
        <header>
          <p className="mb-5 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
            {featuredResources.overline}
          </p>
          <h2 className="font-display text-4xl leading-[1.12] text-white lg:text-5xl">
            {featuredResources.heading}
          </h2>
          <p className="mt-5 font-body text-base leading-relaxed text-white/65">
            {featuredResources.intro}
          </p>
          <a
            href="/start-here"
            className="mt-6 mr-6 inline-flex min-h-11 items-center gap-3 font-body text-sm font-semibold text-[var(--brand-accent)] hover:underline"
          >
            New here? Start with one task
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <a
            href="/resources"
            className="mt-6 inline-flex min-h-11 items-center gap-3 font-body text-sm font-semibold text-[var(--brand-accent)] hover:underline"
          >
            Explore all resources
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </header>
        <div className="divide-y divide-white/15 border-y border-white/15">
          {featuredResources.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className="group grid grid-cols-[1fr_auto] gap-6 py-7 outline-offset-4 transition-colors"
            >
              <div>
                <p className="mb-2 font-body text-xs uppercase tracking-widest text-[var(--brand-accent)]">
                  {item.category}
                </p>
                <h3 className="font-display text-2xl text-white transition-colors group-hover:text-[var(--brand-accent)]">
                  {item.label}
                </h3>
                <p className="mt-3 max-w-lg font-body text-sm leading-relaxed text-white/65">
                  {item.description}
                </p>
              </div>
              <ArrowUpRight
                className="mt-7 text-white/50 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[var(--brand-accent)]"
                size={23}
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
