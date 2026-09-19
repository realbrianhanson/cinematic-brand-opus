import { useSiteConfig } from "@/config/SiteConfigContext";
import type { ResultStat } from "@/config/types";

const StatItem = ({ stat }: { stat: ResultStat }) => {
  // Render the actual result in the server HTML and for reduced-motion visitors.
  const display = stat.locale
    ? stat.end.toLocaleString("en-US")
    : String(stat.end);

  return (
    <div className="text-center lg:text-left">
      <div
        className="font-display italic"
        style={{
          fontSize: "clamp(2.8rem, 5vw, 4.2rem)",
          lineHeight: 1,
          background:
            "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {stat.prefix ?? ""}
        {display}
        {stat.suffix ?? ""}
      </div>
      <div
        className="font-body font-semibold uppercase mt-3"
        style={{ fontSize: 14, letterSpacing: "0.1em", color: "#fff" }}
      >
        {stat.label}
      </div>
      <div
        className="font-body mt-2 leading-relaxed"
        style={{ fontSize: 14, color: "rgba(255,255,255,0.78)" }}
      >
        {stat.sub}
      </div>
    </div>
  );
};

const Stats = () => {
  const siteConfig = useSiteConfig();
  const stats = siteConfig.results;
  if (stats.length === 0) return null;

  return (
    <section
      id="results"
      className="relative py-14 md:py-16"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div
        className="absolute top-0 left-0 w-full h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, rgba(var(--brand-accent-rgb),0.25) 50%, transparent 90%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-full h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, rgba(var(--brand-accent-rgb),0.25) 50%, transparent 90%)",
        }}
      />
      <div
        className={`relative mx-auto px-6 lg:px-14 grid gap-8 lg:gap-8 ${
          stats.length === 3
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-2 lg:grid-cols-4"
        }`}
        style={{ maxWidth: 1440 }}
      >
        {stats.map((s, i) => (
          <StatItem key={i} stat={s} />
        ))}
      </div>
    </section>
  );
};

export default Stats;
