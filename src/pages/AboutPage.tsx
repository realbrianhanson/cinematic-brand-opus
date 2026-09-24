import { ArrowRight, ArrowUpRight } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { Link } from "@/lib/router-compat";
import { summitHref } from "@/lib/summitLink";
import { dropTrailingPeriod } from "@/lib/copyVoice";
import type { PublicSiteSettings } from "@/lib/publicTypes";
import { AboutTestimonials } from "@/components/testimonials/TestimonialQuoteGrid";

interface NextStep {
  eyebrow: string;
  title: string;
  text: string;
  label: string;
  href: string;
  external?: boolean;
  summit?: boolean;
}

function useNextSteps(): NextStep[] {
  const { sections, event, speaking } = useSiteConfig();
  const steps: NextStep[] = [];
  if (sections.event && event.cta)
    steps.push({
      eyebrow: "Free · Live online",
      title: "Learn with me live",
      text: "Three free days on AI for marketing, sales, content, and follow-up. Starting from scratch is fine",
      label: event.cta.label,
      href: summitHref(event.cta.href, "about"),
      external: event.cta.external,
      summit: true,
    });
  steps.push({
    eyebrow: "The Shop",
    title: "Tools and training",
    text: "Start with something free. Then pick the training or tool that fits your next build",
    label: "Browse the Shop",
    href: "/shop",
  });
  if (sections.speaking && speaking.bookingCta)
    steps.push({
      eyebrow: "Speaking",
      title: "Bring me to your event",
      text: "Keynotes and workshops on AI for business owners and their teams",
      label: speaking.bookingCta.label,
      href: "/speaking",
    });
  return steps;
}

function NextStepCard({ step }: { step: NextStep }) {
  const className =
    "group flex h-full flex-col border border-white/15 bg-white/[0.025] p-7 transition-colors hover:border-[var(--brand-accent)]";
  const body = (
    <>
      <p className="font-body text-label font-bold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
        {step.eyebrow}
      </p>
      <h3 className="mt-4 font-display text-title text-white">{step.title}</h3>
      <p className="mt-3 flex-1 font-body text-body text-white/75">
        {step.text}
      </p>
      <span className="mt-6 inline-flex items-center gap-2 font-body text-meta font-semibold text-[var(--brand-accent)]">
        {step.label}
        {step.external ? (
          <ArrowUpRight size={16} aria-hidden="true" />
        ) : (
          <ArrowRight size={16} aria-hidden="true" />
        )}
      </span>
    </>
  );
  if (step.href.startsWith("/") && !step.external)
    return (
      <Link to={step.href} className={className}>
        {body}
      </Link>
    );
  return (
    <a
      href={step.href}
      target={step.external ? "_blank" : undefined}
      rel={step.external ? "noopener noreferrer" : undefined}
      data-conversion-destination={step.summit ? "summit" : undefined}
      data-conversion-placement={step.summit ? "other" : undefined}
      className={className}
    >
      {body}
    </a>
  );
}

export default function AboutPage({
  settings,
}: {
  settings?: PublicSiteSettings | null;
}) {
  const { identity, story, proofBadges } = useSiteConfig();
  const steps = useNextSteps();
  const bio = settings?.author_bio
    ? dropTrailingPeriod(settings.author_bio)
    : "";
  const title = settings?.author_title || identity.role;

  return (
    <div className="public-site min-h-screen bg-[var(--brand-backdrop)] text-white">
      <Nav />
      <main id="main-content">
        <section className="mx-auto grid max-w-[1440px] items-start gap-12 px-6 pb-16 pt-32 lg:grid-cols-[1.1fr_.9fr] lg:gap-20 lg:px-14 lg:pb-24 lg:pt-40">
          <div>
            <Breadcrumbs
              items={[{ label: "Home", href: "/" }, { label: "About" }]}
            />
            <p className="mb-6 mt-8 font-body text-label font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
              {title}
            </p>
            <h1 className="font-display text-display">
              {identity.name}
              <em className="mt-2 block text-[var(--brand-accent)]">
                {story.headingLead} {story.headingAccent}
              </em>
            </h1>
            <p className="mt-7 max-w-xl font-body text-lead text-white/80">
              {bio || story.intro}
            </p>
            {proofBadges.length > 0 && (
              <ul
                aria-label="Credentials"
                className="mt-8 flex flex-wrap gap-2"
              >
                {proofBadges.map((badge) => (
                  <li
                    key={badge}
                    className="border border-white/20 px-3 py-2 font-body text-meta text-white/85"
                  >
                    {badge}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {story.portraitSrc && (
            <figure className="m-0 overflow-hidden border border-white/10 bg-black/10">
              <img
                src={story.portraitSrc}
                alt={story.portraitAlt || identity.name}
                width={story.portraitWidth ?? 730}
                height={story.portraitHeight ?? 998}
                fetchPriority="high"
                className="mx-auto block h-auto max-h-[640px] w-auto max-w-full object-contain"
              />
            </figure>
          )}
        </section>

        {story.timeline.length > 0 && (
          <section
            aria-labelledby="about-story"
            className="border-y border-white/10 bg-[#101015] py-16 lg:py-24"
          >
            <div className="mx-auto grid max-w-[1440px] gap-10 px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-24 lg:px-14">
              <header>
                <p className="mb-4 font-body text-label font-bold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
                  {story.overline}
                </p>
                <h2
                  id="about-story"
                  className="font-display text-headline text-white"
                >
                  The story so far
                </h2>
                <p className="mt-5 font-body text-lead text-white/75">
                  {story.intro}
                </p>
                {story.pullQuote && (
                  <blockquote className="mt-8 border-l border-[var(--brand-accent)] pl-6 font-display text-title italic text-white/85">
                    “{story.pullQuote}”
                  </blockquote>
                )}
              </header>
              <ol className="divide-y divide-white/15 border-y border-white/15">
                {story.timeline.map((entry, index) => (
                  <li
                    key={`${entry.tag}-${entry.time}`}
                    className="grid grid-cols-[2.5rem_1fr] gap-4 py-7"
                  >
                    <span
                      aria-hidden="true"
                      className="pt-1 font-body text-label text-[var(--brand-accent)]"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-body text-label font-semibold uppercase tracking-[0.16em] text-[var(--brand-accent)]">
                        {entry.tag}
                      </p>
                      <h3 className="mt-2 font-display text-title text-white">
                        {entry.time}
                      </h3>
                      <p className="mt-3 font-body text-body text-white/80">
                        {entry.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <AboutTestimonials />

        <section
          aria-labelledby="about-next"
          className="mx-auto max-w-[1440px] px-6 py-16 lg:px-14 lg:py-24"
        >
          <h2 id="about-next" className="font-display text-headline text-white">
            Where to start
          </h2>
          <div
            className={`mt-10 grid gap-5 ${steps.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}
          >
            {steps.map((step) => (
              <NextStepCard key={step.title} step={step} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
