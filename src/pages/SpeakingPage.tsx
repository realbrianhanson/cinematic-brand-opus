import { ArrowDown, ArrowUpRight, Play } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SpeakingInquiry from "@/components/SpeakingInquiry";
import SpeakingTestimonials from "@/components/testimonials/SpeakingTestimonials";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function SpeakingPage() {
  const { speaking, identity, hero, proofBadges } = useSiteConfig();
  const emailBooking = /^mailto:/i.test(speaking.bookingCta?.href || "");
  return (
    <div className="public-site min-h-screen bg-[var(--site-surface,var(--brand-backdrop))] text-white">
      <Nav />
      <main id="main-content">
        <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pb-16 pt-32 lg:grid-cols-[1.15fr_.85fr] lg:gap-20 lg:px-14 lg:pb-24 lg:pt-40">
          <div>
            <p className="mb-6 font-body text-xs font-semibold uppercase tracking-[.18em] text-[var(--site-accent-ink,var(--brand-accent))]">
              {speaking.overline}
            </p>
            <h1
              className="font-display"
              style={{
                fontSize: "clamp(3.25rem, 6.5vw, 6rem)",
                lineHeight: 1.02,
              }}
            >
              {speaking.headingLead}{" "}
              <em className="block text-[var(--site-accent-ink,var(--brand-accent))]">
                {speaking.headingAccent}
              </em>
            </h1>
            <p className="mt-7 max-w-xl font-body text-lg leading-relaxed text-white/75">
              {speaking.intro}
            </p>
            {speaking.bookingCta && (
              <a
                href={
                  emailBooking ? "#speaking-inquiry" : speaking.bookingCta.href
                }
                target={
                  !emailBooking && speaking.bookingCta.external
                    ? "_blank"
                    : undefined
                }
                rel={
                  !emailBooking && speaking.bookingCta.external
                    ? "noopener noreferrer"
                    : undefined
                }
                className="mt-8 inline-flex min-h-14 items-center gap-5 bg-[var(--brand-accent)] px-7 py-4 font-body text-sm font-bold text-[var(--brand-backdrop)] hover:bg-[var(--brand-accent-light)]"
              >
                {speaking.bookingCta.label}
                {emailBooking ? (
                  <ArrowDown size={18} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={18} aria-hidden="true" />
                )}
              </a>
            )}
            {proofBadges.length > 0 && (
              <ul className="mt-8 space-y-2 border-t border-white/15 pt-6 font-body text-base text-white/85">
                {proofBadges.map((badge) => (
                  <li key={badge}>{badge}</li>
                ))}
              </ul>
            )}
          </div>
          {speaking.portraitSrc && (
            <figure data-theme-media className="relative m-0">
              <img
                src={speaking.portraitSrc}
                alt={speaking.portraitAlt}
                width={730}
                height={998}
                fetchPriority="high"
                className="max-h-[650px] w-full object-cover object-top"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent px-7 pb-7 pt-20 font-body text-sm text-white/70">
                {identity.name}
                <span className="mt-1 block text-xs text-[var(--brand-accent)]">
                  {identity.role}
                </span>
              </figcaption>
            </figure>
          )}
        </section>
        <section className="border-y border-white/10 bg-[var(--site-surface,#111116)] py-16 lg:py-24">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-24 lg:px-14">
            <header>
              <p className="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--site-accent-ink,var(--brand-accent))]">
                The conversation
              </p>
              <h2 className="font-display text-4xl leading-tight lg:text-5xl">
                Ideas your audience
                <br />
                <em className="text-[var(--site-accent-ink,var(--brand-accent))]">
                  can put to work
                </em>
              </h2>
              <p className="mt-5 font-body text-base leading-relaxed text-white/65">
                Share your audience, event format, and goals in your inquiry so
                we can pick the right topic
              </p>
            </header>
            <ol className="divide-y divide-white/15 border-y border-white/15">
              {speaking.topics.map((topic, index) => (
                <li
                  key={topic.title}
                  className="grid grid-cols-[2rem_1fr] gap-5 py-7"
                >
                  <span
                    className="font-body text-sm text-[var(--site-accent-ink,var(--brand-accent))]"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl">{topic.title}</h3>
                    <p className="mt-3 font-body text-base leading-relaxed text-white/65">
                      {topic.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        {hero.videoSrc && (
          <section className="mx-auto max-w-[1440px] px-6 py-16 lg:px-14 lg:py-24">
            <div className="mb-7 flex items-center gap-3">
              <Play
                size={20}
                className="text-[var(--site-accent-ink,var(--brand-accent))]"
                aria-hidden="true"
              />
              <h2 className="font-display text-3xl">A look inside the room</h2>
            </div>
            <video
              src={hero.videoSrc}
              poster={hero.posterSrc || undefined}
              controls
              playsInline
              preload="none"
              aria-label={`Event footage featuring ${identity.name}`}
              data-theme-media
              className="aspect-video max-h-[650px] w-full border border-white/15 bg-black"
            >
              <a href={hero.videoSrc}>Watch event footage</a>
            </video>
          </section>
        )}
        <SpeakingTestimonials />
        {speaking.testimonial && (
          <figure className="mx-auto mb-16 max-w-3xl px-6 text-center">
            <blockquote className="font-display text-3xl italic leading-relaxed">
              “{speaking.testimonial.quote}”
            </blockquote>
            <figcaption className="mt-6 font-body text-sm text-[var(--brand-accent)]">
              {speaking.testimonial.attribution}
            </figcaption>
          </figure>
        )}
        {speaking.bookingCta && emailBooking && (
          <section
            id="speaking-inquiry"
            className="border-t border-white/10 bg-[var(--site-surface,#111116)] py-16 lg:py-24"
          >
            <div className="mx-auto grid max-w-[1440px] gap-9 px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-24 lg:px-14">
              <header>
                <p className="mb-4 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--site-accent-ink,var(--brand-accent))]">
                  Let's talk about your event
                </p>
                <h2 className="font-display text-4xl leading-tight lg:text-5xl">
                  Start the
                  <br />
                  <em className="text-[var(--site-accent-ink,var(--brand-accent))]">
                    conversation
                  </em>
                </h2>
                <p className="mt-5 max-w-sm font-body text-base leading-relaxed text-white/65">
                  Tell us a little about your audience and what you have in
                  mind. An inquiry doesn’t commit you to a booking
                </p>
              </header>
              <SpeakingInquiry href={speaking.bookingCta.href} />
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
