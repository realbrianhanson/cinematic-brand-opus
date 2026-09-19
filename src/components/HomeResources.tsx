import { ArrowUpRight } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import HomeSectionHeading from "./HomeSectionHeading";

export default function HomeResources() {
  const { featuredResources } = useSiteConfig();
  if (!featuredResources?.items.length) return null;
  return (
    <section
      id="resources"
      className="py-16 lg:py-24"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div className="mx-auto max-w-[1440px] px-6 lg:px-14">
        <HomeSectionHeading
          overline={featuredResources.overline}
          intro={featuredResources.intro}
        >
          {featuredResources.heading}
        </HomeSectionHeading>
        <div className="grid md:grid-cols-3 gap-5">
          {featuredResources.items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className="group flex flex-col p-6 lg:p-8 border border-white/20 bg-white/[0.02] hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <span
                className="font-body text-xs uppercase tracking-widest font-bold mb-5"
                style={{ color: "var(--brand-accent)" }}
              >
                {item.category}
              </span>
              <h3 className="font-display text-2xl text-white mb-3 group-hover:underline underline-offset-4">
                {item.label}
              </h3>
              <p className="font-body text-base leading-relaxed text-white/80 mb-6">
                {item.description}
              </p>
              <span
                className="mt-auto font-body text-sm font-semibold flex items-center gap-2"
                style={{ color: "var(--brand-accent)" }}
              >
                Read the guide <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
