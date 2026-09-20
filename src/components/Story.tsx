import { useSiteConfig } from "@/config/SiteConfigContext";

export default function Story() {
  const { story, identity } = useSiteConfig();
  return (
    <section
      id="story"
      className="border-y border-white/10 bg-[#101015] py-20 lg:py-28"
    >
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-20 lg:px-14">
        <div>
          {story.portraitSrc && (
            <figure className="mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-white/10 bg-black/10">
              <img
                src={story.portraitSrc}
                alt={story.portraitAlt || identity.name}
                loading="lazy"
                decoding="async"
                width={story.portraitWidth ?? 730}
                height={story.portraitHeight ?? 998}
                className="mx-auto block h-auto max-h-[630px] w-auto max-w-full object-contain"
              />
              <figcaption className="px-5 py-4 font-body text-xs uppercase tracking-[.2em] text-white/75">
                {identity.name}
              </figcaption>
            </figure>
          )}
          {story.pullQuote && (
            <blockquote className="mt-7 border-l border-[var(--brand-accent)] pl-6 font-display text-2xl italic leading-relaxed text-white/85">
              “{story.pullQuote}”
            </blockquote>
          )}
        </div>
        <div>
          <p className="mb-5 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]">
            {story.overline}
          </p>
          <h2
            className="font-display text-white"
            style={{ fontSize: "clamp(2.5rem, 4.4vw, 4rem)", lineHeight: 1.08 }}
          >
            {story.headingLead}
            <em className="mt-1 block text-[var(--brand-accent)]">
              {story.headingAccent}
            </em>
          </h2>
          <p className="mt-6 font-body text-base leading-relaxed text-white/75 lg:text-lg">
            {story.intro}
          </p>
          <ol className="mt-9 divide-y divide-white/15 border-t border-white/15">
            {story.timeline.map((entry, index) => (
              <li
                key={`${entry.tag}-${entry.time}`}
                className="grid grid-cols-[2rem_1fr] gap-4 py-6"
              >
                <span
                  aria-hidden="true"
                  className="pt-0.5 font-body text-xs text-[var(--brand-accent)]"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-body text-sm font-semibold text-white">
                    {entry.time}
                  </h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-white/65">
                    {entry.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
