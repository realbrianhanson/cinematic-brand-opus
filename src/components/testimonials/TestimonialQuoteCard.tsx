import type { TestimonialItem } from "@/config/types";
import { cn } from "@/lib/utils";

/**
 * A typed quote. "card" is the standard tile; "feature" echoes the gold-rule
 * lead quote for a longer statement that spans two columns.
 */
export default function TestimonialQuoteCard({
  item,
  variant = "card",
}: {
  item: TestimonialItem;
  variant?: "card" | "feature";
}) {
  const feature = variant === "feature";
  return (
    <figure
      className={cn(
        "m-0 flex h-full flex-col",
        feature
          ? "border-l-2 border-[var(--brand-accent)] bg-[linear-gradient(135deg,rgba(var(--brand-accent-rgb),.08),transparent)] p-7 lg:p-10"
          : "border border-white/10 bg-white/[0.025] p-6 sm:p-7",
      )}
    >
      <span
        aria-hidden="true"
        className={
          feature
            ? "block h-9 font-display text-6xl leading-none text-[var(--brand-accent)]"
            : "block h-7 font-display text-5xl leading-none text-[var(--brand-accent)]"
        }
      >
        “
      </span>
      <blockquote
        className={cn(
          "font-display text-white",
          feature
            ? "text-2xl leading-snug md:text-[1.75rem]"
            : "text-[1.3125rem] leading-[1.4] text-white/90",
        )}
      >
        <p>{item.quote}</p>
      </blockquote>
      <figcaption className="mt-auto pt-6 font-body text-sm">
        <span className="block font-semibold text-white">
          {item.attribution}
        </span>
        {item.context && (
          <span className="mt-1 block text-white/70">{item.context}</span>
        )}
      </figcaption>
    </figure>
  );
}
