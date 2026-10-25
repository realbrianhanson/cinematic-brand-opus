import { ArrowUpRight } from "lucide-react";
import { useHomeBand } from "@/lib/homeBand";

/** Sends visitors who want help, not training, to the consulting application. */
export default function HomeWorkWithMe() {
  const band = useHomeBand();
  if (!band) return null;
  return (
    <section
      id="work-with-me"
      aria-labelledby="home-work-heading"
      className="mx-auto max-w-[1440px] px-6 py-12 lg:px-14"
    >
      <div className="flex flex-col gap-6 border border-[var(--brand-accent)]/40 bg-white/[0.025] p-8 md:flex-row md:items-center md:justify-between lg:p-12">
        <div className="max-w-2xl">
          <h2
            id="home-work-heading"
            className="font-display text-3xl text-white sm:text-4xl"
          >
            {band.heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            {band.text}
          </p>
        </div>
        <a
          href={band.href}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 self-start bg-[var(--brand-accent)] px-6 text-sm font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)] md:self-center"
        >
          {band.cta}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
