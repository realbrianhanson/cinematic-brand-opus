import { useId, useState, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";
import type { Testimonial, TestimonialWallConfig } from "@/config/types";
import { cn } from "@/lib/utils";
import { testimonialCopy } from "./copy";
import TestimonialGroupLabel from "./TestimonialGroupLabel";

/**
 * The track holds the lines twice and slides left by exactly one copy, so the
 * loop is seamless. React hoists this into <head>, server HTML included.
 */
const WALL_KEYFRAMES =
  "@keyframes testimonial-wall-scroll{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}";

/** Slow enough to read in motion: each line takes this long to cross. */
const SECONDS_PER_LINE = 11;

/**
 * A slow marquee of short lines. It pauses on hover, on keyboard focus and
 * with the Pause button. With reduced motion requested it never moves: the
 * loop copy disappears and the lines wrap into a static grid. Motion-only
 * sizing is scoped to `motion-safe` so the static grid never inherits it.
 */
export default function TestimonialWall({
  wall,
}: {
  wall: TestimonialWallConfig;
}) {
  const id = useId();
  const [paused, setPaused] = useState(false);
  if (wall.items.length === 0) return null;
  const headingId = `${id}-heading`;
  const ControlIcon = paused ? Play : Pause;
  // Paused is inline on purpose: the `animation` shorthand in the motion-safe
  // media block comes later in the stylesheet and would reset a paused class.
  const trackStyle = {
    "--wall-duration": `${wall.items.length * SECONDS_PER_LINE}s`,
    ...(paused && { animationPlayState: "paused" }),
  } as CSSProperties;

  return (
    <section aria-labelledby={headingId}>
      <style href="testimonial-wall-scroll" precedence="default">
        {WALL_KEYFRAMES}
      </style>
      <TestimonialGroupLabel
        id={headingId}
        action={
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 px-4 font-body text-sm font-semibold text-white/80 transition-colors hover:border-[var(--brand-accent)] hover:text-white motion-reduce:hidden"
          >
            <ControlIcon
              aria-hidden="true"
              size={14}
              className="text-[var(--brand-accent)]"
            />
            {paused ? testimonialCopy.play : testimonialCopy.pause}
            <span className="sr-only">
              {" "}
              {testimonialCopy.wallControlTarget}
            </span>
          </button>
        }
      >
        {wall.label}
      </TestimonialGroupLabel>
      <div
        role="group"
        aria-labelledby={headingId}
        tabIndex={0}
        className="group/wall mt-8"
      >
        <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)] motion-reduce:overflow-visible motion-reduce:[mask-image:none]">
          <div
            style={trackStyle}
            className="flex motion-safe:w-max motion-safe:animate-[testimonial-wall-scroll_var(--wall-duration)_linear_infinite] group-hover/wall:[animation-play-state:paused] group-focus-within/wall:[animation-play-state:paused]"
          >
            <WallLines items={wall.items} />
            <WallLines items={wall.items} loop />
          </div>
        </div>
      </div>
    </section>
  );
}

function WallLines({
  items,
  loop = false,
}: {
  items: Testimonial[];
  loop?: boolean;
}) {
  return (
    <ul
      role={loop ? undefined : "list"}
      aria-hidden={loop || undefined}
      className={cn(
        "flex shrink-0 items-stretch gap-5 motion-safe:pr-5 sm:gap-6 sm:motion-safe:pr-6",
        loop
          ? "motion-reduce:hidden"
          : "motion-reduce:grid motion-reduce:w-full motion-reduce:grid-cols-1 sm:motion-reduce:grid-cols-2 lg:motion-reduce:grid-cols-4",
      )}
    >
      {items.map((item, index) => (
        <li
          key={`${item.attribution}-${index}`}
          className="flex shrink-0 motion-safe:w-[17rem] sm:motion-safe:w-[20rem]"
        >
          <figure className="m-0 flex w-full flex-col border-l border-[rgba(var(--brand-accent-rgb),0.35)] py-1 pl-5">
            <span
              aria-hidden="true"
              className="block h-7 font-display text-5xl leading-none text-[var(--brand-accent)]"
            >
              “
            </span>
            <blockquote className="font-display text-xl leading-snug text-white/90 sm:text-[1.375rem]">
              <p>{item.quote}</p>
            </blockquote>
            <figcaption className="mt-auto pt-4 font-body text-sm text-white/70">
              {item.attribution}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
