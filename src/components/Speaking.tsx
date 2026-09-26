import { ArrowUpRight, Mic2 } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";

/** A focused invitation; the full brief and inquiry form live on /speaking. */
export default function Speaking() {
  const { speaking } = useSiteConfig();
  return (
    <section
      id="speaking"
      className="bg-[var(--site-surface,#0d0e14)] py-16 lg:py-24"
    >
      <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-6 lg:grid-cols-[1.4fr_1fr] lg:gap-24 lg:px-14">
        <div>
          <p className="mb-5 flex items-center gap-3 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
            <Mic2 size={17} aria-hidden="true" />
            {speaking.overline}
          </p>
          <h2 className="font-display text-4xl leading-[1.08] text-white md:text-5xl">
            {speaking.headingLead}{" "}
            <em className="text-[var(--brand-accent)]">
              {speaking.headingAccent}
            </em>
          </h2>
        </div>
        <div>
          <p className="font-body text-base leading-relaxed text-white/75">
            {speaking.intro}
          </p>
          <a
            href="/speaking"
            className="mt-6 inline-flex min-h-12 items-center gap-4 border-b border-[var(--brand-accent)] font-body text-sm font-semibold text-[var(--brand-accent)] transition-colors hover:text-white"
          >
            Explore speaking & workshops
            <ArrowUpRight size={20} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
