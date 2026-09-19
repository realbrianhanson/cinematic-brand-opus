import { Brain, Target, Code2, Users } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import HomeSectionHeading from "./HomeSectionHeading";

const ICONS = {
  brain: Brain,
  target: Target,
  code: Code2,
  users: Users,
} as const;
export default function Expertise() {
  const { expertise } = useSiteConfig();
  return (
    <section
      id="expertise"
      className="py-16 lg:py-24"
      style={{ background: "#0A0B12" }}
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <HomeSectionHeading
          overline={expertise.overline}
          intro={expertise.intro}
        >
          {expertise.headingLead}{" "}
          <em style={{ color: "var(--brand-accent)" }}>
            {expertise.headingAccent}
          </em>
        </HomeSectionHeading>
        <div className="grid md:grid-cols-2 gap-5">
          {expertise.cards.map((card) => {
            const Icon = ICONS[card.icon];
            return (
              <article
                key={card.title}
                className="border border-white/15 p-6 lg:p-8 bg-white/[0.02]"
              >
                <Icon
                  size={24}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="mb-5"
                  style={{ color: "var(--brand-accent)" }}
                />
                <h3 className="font-display text-2xl text-white mb-3">
                  {card.title}
                </h3>
                <p className="font-body text-base leading-relaxed text-white/80">
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
