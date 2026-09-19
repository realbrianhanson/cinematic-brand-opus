import type { ReactNode } from "react";

export default function HomeSectionHeading({
  overline,
  children,
  intro,
}: {
  overline: string;
  children: ReactNode;
  intro?: string;
}) {
  return (
    <header className="max-w-3xl mb-10 lg:mb-12">
      <p
        className="font-body text-xs font-bold uppercase tracking-[0.18em] mb-4"
        style={{ color: "var(--brand-accent)" }}
      >
        {overline}
      </p>
      <h2
        className="font-display text-white"
        style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)", lineHeight: 1.12 }}
      >
        {children}
      </h2>
      {intro && (
        <p className="font-body text-base lg:text-lg leading-relaxed mt-5 text-white/80">
          {intro}
        </p>
      )}
    </header>
  );
}
