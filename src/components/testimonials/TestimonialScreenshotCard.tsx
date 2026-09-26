import type { CSSProperties } from "react";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TestimonialItem, TestimonialScreenshot } from "@/config/types";
import { testimonialCopy } from "./copy";
import TestimonialNote from "./TestimonialNote";

/**
 * A real chat screenshot, shown at half its natural size (the files are 2x)
 * with explicit dimensions so nothing shifts while it loads. The image keeps
 * its verbatim alt text; a separate full-size button opens the same accessible
 * dialog pattern as the offer body images.
 */
export default function TestimonialScreenshotCard({
  item,
  screenshot,
  note,
}: {
  item: TestimonialItem;
  screenshot: TestimonialScreenshot;
  /** Repeated under the enlarged image, e.g. the income disclosure. */
  note?: string;
}) {
  const displayWidth = Math.round(screenshot.width / 2);
  return (
    <figure className="group/card m-0 flex h-full flex-col border border-white/10 bg-white/[0.025] transition-colors duration-300 focus-within:border-[rgba(var(--brand-accent-rgb),0.45)] hover:border-[rgba(var(--brand-accent-rgb),0.45)]">
      <Dialog>
        <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,rgba(var(--brand-accent-rgb),0.1),transparent_65%)] px-5 pb-12 pt-7 sm:px-8 sm:pt-9">
          {/* Phones: fill the card up to 420px. From sm: exactly half size. */}
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            width={displayWidth}
            height={Math.round(screenshot.height / 2)}
            loading="lazy"
            decoding="async"
            style={{ "--shot-width": `${displayWidth}px` } as CSSProperties}
            className="block h-auto w-full max-w-[420px] rounded-xl shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:w-[var(--shot-width)] sm:max-w-full"
          />
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`${testimonialCopy.enlargeMessageFrom} ${item.attribution}`}
              className="absolute inset-0 flex cursor-zoom-in items-end justify-end p-3"
            >
              <span
                aria-hidden="true"
                data-theme-media
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 font-body text-xs font-semibold text-white/85 transition-colors group-hover/card:border-[var(--brand-accent)] group-hover/card:text-white"
              >
                <Maximize2
                  size={12}
                  className="text-[var(--brand-accent)]"
                  aria-hidden="true"
                />
                {testimonialCopy.enlarge}
              </span>
            </button>
          </DialogTrigger>
        </div>
        <DialogContent
          {...(!item.context && { "aria-describedby": undefined })}
          className="block max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[44rem] overflow-y-auto border-white/15 bg-[var(--site-surface,var(--brand-backdrop))] p-5 text-white sm:p-8"
        >
          <DialogTitle className="pr-10 font-display text-2xl font-normal leading-tight tracking-normal text-white">
            {item.attribution}
          </DialogTitle>
          {item.context && (
            <DialogDescription className="mt-1 font-body text-sm text-white/70">
              {item.context}
            </DialogDescription>
          )}
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            width={screenshot.width}
            height={screenshot.height}
            decoding="async"
            className="mx-auto mt-6 block h-auto max-w-full rounded-xl ring-1 ring-white/10"
          />
          {note && <TestimonialNote className="mt-6">{note}</TestimonialNote>}
        </DialogContent>
      </Dialog>
      <figcaption className="border-t border-white/10 px-5 py-5 font-body text-sm sm:px-7">
        {screenshot.showQuote && (
          <blockquote className="mb-4 text-base leading-relaxed text-white/85">
            <p>“{item.quote}”</p>
          </blockquote>
        )}
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
