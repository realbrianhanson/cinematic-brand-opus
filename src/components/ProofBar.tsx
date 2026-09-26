import { useSiteConfig } from "@/config/SiteConfigContext";

const ProofBar = () => {
  const { proofBadges: items } = useSiteConfig();
  if (items.length === 0) return null;

  return (
    <section
      id="proof"
      aria-label="Experience and community"
      className="relative py-6 md:py-7"
      style={{ background: "var(--site-surface, var(--brand-backdrop))" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(var(--brand-accent-rgb),0.25), transparent)",
        }}
      />
      <ul className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-6 md:flex-row md:flex-wrap md:gap-x-12 md:gap-y-5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 text-center">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rotate-45"
              style={{ background: "var(--brand-accent)" }}
            />
            <span
              className="font-body text-xs font-semibold uppercase leading-relaxed md:text-sm"
              style={{
                letterSpacing: "0.09em",
                color: "var(--site-text-86, rgba(255,255,255,0.86))",
              }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(var(--brand-accent-rgb),0.25), transparent)",
        }}
      />
    </section>
  );
};

export default ProofBar;
