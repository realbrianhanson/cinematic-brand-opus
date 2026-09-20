import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function OfferBodyImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="m-0 min-w-0 py-3">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Enlarge image: ${alt}`}
            className="group block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]"
          >
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full rounded-xl border border-white/15 bg-white/[0.025] object-contain"
            />
            <span className="mt-2 block text-sm text-white/65 group-hover:text-white">
              Click or tap to enlarge
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="block max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[1400px] overflow-hidden border-white/20 bg-[var(--brand-backdrop)] p-4 text-white sm:p-6">
          <div className="max-h-[calc(100dvh-5rem)] min-w-0 space-y-4 overflow-y-auto pr-6 [overflow-wrap:anywhere]">
            <DialogTitle className="leading-snug">{alt}</DialogTitle>
            <DialogDescription className="text-white/75">
              {caption && <span className="mb-2 block">{caption}</span>}
              Scroll to explore the full-size image.
            </DialogDescription>
            <div
              role="region"
              aria-label="Full-size image"
              tabIndex={0}
              className="max-h-[70dvh] min-h-[min(12rem,40dvh)] min-w-0 overflow-auto overscroll-contain rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
            >
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="mx-auto block h-auto w-auto max-w-none object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {caption && (
        <figcaption className="mt-3 text-sm leading-relaxed text-white/70">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
