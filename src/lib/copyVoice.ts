/**
 * Site voice helpers. Brian's copy never ends a paragraph with a period, so
 * copy that comes from the database is normalized before it is shown.
 */

/** Drops a single closing period; an ellipsis ("...") is left alone. */
export const dropTrailingPeriod = (text: string) =>
  text.trim().replace(/(?<!\.)\.$/, "");
