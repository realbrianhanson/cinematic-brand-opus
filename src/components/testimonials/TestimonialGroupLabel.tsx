import type { ReactNode } from "react";

/** Small gold overline heading with a hairline that fades to the right. */
export default function TestimonialGroupLabel({
  id,
  as: Heading = "h3",
  action,
  children,
}: {
  id: string;
  as?: "h2" | "h3";
  /** Optional control shown at the end of the row. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <Heading
        id={id}
        className="min-w-0 font-body text-xs font-bold uppercase tracking-[.18em] text-[var(--brand-accent)]"
      >
        {children}
      </Heading>
      <span
        aria-hidden="true"
        className="h-px min-w-8 flex-1 bg-gradient-to-r from-[rgba(var(--brand-accent-rgb),0.45)] to-transparent"
      />
      {action}
    </div>
  );
}
