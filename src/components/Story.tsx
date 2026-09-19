import { Flame, Zap, Award, Sparkles } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import HomeSectionHeading from "./HomeSectionHeading";

const ICONS = {
  flame: Flame,
  zap: Zap,
  award: Award,
  sparkles: Sparkles,
} as const;

export default function Story() {
  const { story } = useSiteConfig();
  return (
    <section
      id="story"
      className="relative py-16 lg:py-24"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <HomeSectionHeading overline={story.overline} intro={story.intro}>
          {story.headingLead}{" "}
          <em style={{ color: "var(--brand-accent)" }}>
            {story.headingAccent}
          </em>
        </HomeSectionHeading>
        <ol className="grid md:grid-cols-3 gap-6 lg:gap-10">
          {story.timeline.map((entry) => {
            const Icon = ICONS[entry.icon];
            return (
              <li
                key={`${entry.tag}-${entry.time}`}
                className="border-t pt-6"
                style={{ borderColor: "rgba(var(--brand-accent-rgb),0.3)" }}
              >
                <div
                  className="flex items-center gap-3 mb-4"
                  style={{ color: "var(--brand-accent)" }}
                >
                  <Icon size={20} aria-hidden="true" />
                  <h3 className="font-body text-sm font-bold uppercase tracking-widest">
                    {entry.tag}
                  </h3>
                </div>
                <p className="font-body text-sm text-white/70 mb-3">
                  {entry.time}
                </p>
                <p className="font-body text-base leading-relaxed text-white/85">
                  {entry.text}
                </p>
              </li>
            );
          })}
        </ol>
        {story.pullQuote && (
          <blockquote
            className="font-display italic text-xl lg:text-2xl leading-relaxed max-w-3xl mt-10 pl-6 border-l-2 text-white/90"
            style={{ borderColor: "var(--brand-accent)" }}
          >
            “{story.pullQuote}”
          </blockquote>
        )}
      </div>
    </section>
  );
}
