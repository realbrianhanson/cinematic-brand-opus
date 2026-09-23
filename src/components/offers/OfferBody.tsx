import OfferBodyImage from "@/components/OfferBodyImage";
import { offerBodyBlocks } from "@/lib/offerBody";

/** Shared, text-safe rendering for landing pages, upsells, and draft previews. */
export default function OfferBody({ body }: { body: string }) {
  return (
    <div className="space-y-5 text-base leading-relaxed text-white/75">
      {offerBodyBlocks(body).map((block, i) => {
        if (block.type === "heading")
          return (
            <h2
              key={i}
              className="pt-4 font-display text-3xl leading-tight text-white"
            >
              {block.text}
            </h2>
          );
        if (block.type === "list")
          return (
            <ul
              key={i}
              className="space-y-3 pl-5 list-disc marker:text-[var(--brand-accent)]"
            >
              {block.items.map((item, index) => (
                <li key={index} className="pl-1">
                  {item}
                </li>
              ))}
            </ul>
          );
        if (block.type === "image")
          return <OfferBodyImage key={i} {...block} />;
        if (block.type === "quote")
          return (
            <figure
              key={i}
              className="m-0 border-l-2 border-[var(--brand-accent)] bg-white/[0.035] p-6 md:p-8"
            >
              <span
                aria-hidden="true"
                className="font-display text-5xl leading-none text-[var(--brand-accent)]"
              >
                “
              </span>
              <blockquote className="space-y-5 text-lg leading-relaxed text-white/90">
                {block.paragraphs.map((text, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {text}
                  </p>
                ))}
              </blockquote>
              {block.attribution && (
                <figcaption className="mt-6 text-sm font-semibold text-[var(--brand-accent)]">
                  {block.attribution}
                </figcaption>
              )}
            </figure>
          );
        return (
          <p key={i} className="whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
