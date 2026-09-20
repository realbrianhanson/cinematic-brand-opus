import { useId, useState, type RefObject } from "react";
import { offerBodyBlocks, safeOfferImageUrl } from "@/lib/offerBody";

export default function OfferImageInsert({
  body,
  onChange,
  textareaRef,
}: {
  body: string;
  onChange: (body: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");

  function insert() {
    const src = safeOfferImageUrl(url.trim());
    if (!src) {
      setError(
        "Enter a full HTTPS image URL without spaces or login details (up to 2,048 characters).",
      );
      return;
    }
    if (!alt.trim() || /[\u005b\u005d\p{Cc}]/u.test(alt)) {
      setError(
        "Describe the image in one line without square brackets so everyone can understand it.",
      );
      return;
    }
    if (/["\p{Cc}]/u.test(caption)) {
      setError("Use a single line without double quotes for the caption.");
      return;
    }
    const markup = `![${alt.trim()}](${src}${caption.trim() ? ` "${caption.trim()}"` : ""})`;
    // A URL may be HTTPS yet contain format delimiters; never insert unreadable markup.
    if (offerBodyBlocks(markup)[0]?.type !== "image") {
      setError(
        "This image URL contains formatting characters. Use a direct image URL with parentheses encoded as %28 and %29.",
      );
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? start;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const prefix =
      before && !before.endsWith("\n\n")
        ? before.endsWith("\n")
          ? "\n"
          : "\n\n"
        : "";
    const suffix = after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
    const next = `${before}${prefix}${markup}${suffix}${after}`;
    if (next.length > 20000) {
      setError(
        "The full description would exceed 20,000 characters. Shorten it before inserting the image.",
      );
      return;
    }
    onChange(next);
    setOpen(false);
    setUrl("");
    setAlt("");
    setCaption("");
    setError("");
    requestAnimationFrame(() => {
      textarea?.focus();
      const caret =
        before.length + prefix.length + markup.length + suffix.length;
      textarea?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="admin-btn-secondary"
        aria-expanded={open}
        aria-controls={`${id}-fields`}
        onClick={() => {
          setOpen((value) => !value);
          setError("");
        }}
      >
        Insert image
      </button>
      {open && (
        <div
          id={`${id}-fields`}
          role="group"
          aria-labelledby={`${id}-title`}
          className="space-y-4 rounded-lg border border-current/15 p-4"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              insert();
            }
          }}
        >
          <p id={`${id}-title`} className="text-sm font-semibold">
            Add an image to the description
          </p>
          <label className="block text-sm font-medium">
            Image URL
            <input
              className="admin-input mt-2 w-full"
              inputMode="url"
              maxLength={2048}
              placeholder="https://…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Image description (alt text)
            <input
              className="admin-input mt-2 w-full"
              maxLength={500}
              placeholder="Describe the useful information in this image"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Image caption (optional)
            <input
              className="admin-input mt-2 w-full"
              maxLength={1000}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          <p className="admin-help">
            Use an HTTPS image you have permission to share. The image is
            inserted at your cursor in the description; save the offer when your
            edits are ready.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="admin-btn-primary"
              onClick={insert}
            >
              Add to description
            </button>
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
