/** Convert an instant to an explicit IANA timezone's datetime-local value. */
export function zonedInput(instant: string | Date, timezone: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Reject DST gaps/overlaps rather than silently choosing the wrong instant. */
export function scheduledInstant(local: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Choose a publish date and time.");
  const wall = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Invalid publish date.");
  const offsets = new Set<number>();
  // The neighboring days reveal both sides of a timezone transition.
  for (const hours of [-48, -24, 0, 24, 48]) {
    const sample = wall + hours * 3600000;
    offsets.add(
      Date.parse(`${zonedInput(new Date(sample), timezone)}:00Z`) - sample,
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((candidate) => zonedInput(candidate, timezone) === local);
  if (matches.length === 0)
    throw new Error(
      "This local time does not exist because the clocks change. Choose another time.",
    );
  if (matches.length > 1)
    throw new Error(
      "This local time occurs twice because the clocks change. Choose a time outside the clock change.",
    );
  return matches[0].toISOString();
}
