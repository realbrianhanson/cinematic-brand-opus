import { useId } from "react";
import type { TestimonialGroup } from "@/config/types";
import { groupItemLayout } from "./layout";
import TestimonialGroupLabel from "./TestimonialGroupLabel";
import TestimonialNote from "./TestimonialNote";
import TestimonialQuoteCard from "./TestimonialQuoteCard";
import TestimonialScreenshotCard from "./TestimonialScreenshotCard";

/**
 * One labelled group of testimonials: a <section> named by its overline
 * heading, one list item per person, and an optional note (such as the income
 * disclosure) directly under the list.
 */
export default function TestimonialGroupSection({
  group,
}: {
  group: TestimonialGroup;
}) {
  const id = useId();
  if (group.items.length === 0) return null;
  const headingId = `${id}-heading`;
  const noteId = group.disclosure ? `${id}-note` : undefined;
  return (
    <section aria-labelledby={headingId} aria-describedby={noteId}>
      <TestimonialGroupLabel id={headingId}>
        {group.label}
      </TestimonialGroupLabel>
      <ul
        role="list"
        className="mt-7 grid gap-5 md:grid-flow-row-dense md:grid-cols-2 lg:gap-6 xl:grid-cols-3"
      >
        {group.items.map((item, index) => (
          <li
            key={`${item.attribution}-${index}`}
            className={groupItemLayout(group.items, index) || undefined}
          >
            {item.screenshot ? (
              <TestimonialScreenshotCard
                item={item}
                screenshot={item.screenshot}
                note={group.disclosure}
              />
            ) : (
              <TestimonialQuoteCard
                item={item}
                variant={item.layout === "wide" ? "feature" : "card"}
              />
            )}
          </li>
        ))}
      </ul>
      {group.disclosure && (
        <TestimonialNote id={noteId} className="mt-6">
          {group.disclosure}
        </TestimonialNote>
      )}
    </section>
  );
}
