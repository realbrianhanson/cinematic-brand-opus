import type { TestimonialItem } from "@/config/types";

/**
 * Grid placement for card `index` in a homepage testimonial group. Groups use
 * one column on phones, two from `md` and three from `xl`, packed densely.
 *
 * - "wide" cards take a full row on two columns and two of three on `xl`.
 * - "tall" cards span two rows on `xl`.
 * - If the other cards leave an odd one out on two columns, the last of them
 *   spans both columns there.
 *
 * Class names are written out in full so Tailwind can find them.
 */
export function groupItemLayout(
  items: TestimonialItem[],
  index: number,
): string {
  const item = items[index];
  if (item.layout === "wide") return "md:col-span-2";
  const singles = items.filter((other) => other.layout !== "wide");
  const oddOneOut =
    singles.length % 2 === 1 && singles[singles.length - 1] === item;
  const classes: string[] = [];
  if (oddOneOut) classes.push("md:col-span-2 xl:col-span-1");
  if (item.layout === "tall") classes.push("xl:row-span-2");
  return classes.join(" ");
}

const LG_SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  6: "lg:col-span-6",
};

/**
 * Grid placement for the quote grid: rows of three on a six-column `lg` grid,
 * with a short last row stretched to fill it. An odd last card spans both
 * `md` columns.
 */
export function quoteGridLayout(index: number, count: number): string {
  const classes: string[] = [];
  if (count % 2 === 1 && index === count - 1) classes.push("md:col-span-2");
  const lastRowSize = count % 3 || 3;
  const inLastRow = index >= count - lastRowSize;
  classes.push(LG_SPAN[inLastRow ? 6 / lastRowSize : 2]);
  return classes.join(" ");
}
