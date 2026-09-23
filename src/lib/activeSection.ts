/** Distance below the viewport top (the fixed nav height) that marks "here". */
export const NAV_SECTION_OFFSET = 120;

type Box = Pick<DOMRect, "top" | "bottom">;

/**
 * The in-page section the reader is currently inside, or "" once they have
 * scrolled past it (so a nav link does not stay lit down to the footer).
 */
export function activeSectionAt(
  ids: readonly string[],
  boxOf: (id: string) => Box | null,
  offset = NAV_SECTION_OFFSET,
): string {
  let current = "";
  for (const id of ids) {
    const box = boxOf(id);
    if (box && box.top <= offset && box.bottom > offset) current = id;
  }
  return current;
}
