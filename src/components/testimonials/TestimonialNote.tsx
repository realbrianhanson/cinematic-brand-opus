import { Info } from "lucide-react";

/**
 * A readable note that travels with a testimonial group, such as the income
 * disclosure. 15px at 80% white, never tiny grey fine print.
 *
 * Classes are joined by hand: `cn` (tailwind-merge) reads the `text-body`
 * size token as a colour and would drop it next to `text-white/80`.
 */
export default function TestimonialNote({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: string;
}) {
  return (
    <p
      id={id}
      className={`flex max-w-3xl items-start gap-3 font-body text-body text-white/80 ${className ?? ""}`.trim()}
    >
      <Info
        aria-hidden="true"
        size={16}
        className="mt-[0.3rem] shrink-0 text-[var(--brand-accent)]"
      />
      {children}
    </p>
  );
}
