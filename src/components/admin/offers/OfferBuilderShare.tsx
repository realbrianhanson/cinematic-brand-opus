import { useRef } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function OfferBuilderShare({
  savedId,
  savedSlug,
  savedStatus,
  savedInShop,
  dirty,
  funnelOnly,
  onNotice,
}: {
  savedId: string;
  savedSlug: string;
  savedStatus: string;
  savedInShop: boolean;
  dirty: boolean;
  funnelOnly: boolean;
  onNotice: (value: string) => void;
}) {
  const config = useSiteConfig();
  const linkRef = useRef<HTMLInputElement>(null);
  const link = `${config.identity.siteUrl}/offers/${savedSlug}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onNotice("Published page link copied.");
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      onNotice("Select and copy the page link below.");
    }
  }
  return (
    <section className="admin-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">Preview & share</h2>
      {savedId ? (
        <>
          <a
            className="admin-btn-secondary w-full"
            href={`/offers/preview/${savedId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preview saved draft <ArrowUpRight size={15} />
          </a>
          <p className="admin-help">
            {dirty
              ? "The live preview includes your unsaved edits. Save your draft to include them in the private preview link."
              : "The saved draft preview is private to administrators."}
          </p>
          {savedStatus === "published" ? (
            <>
              <label className="block text-sm font-medium">
                Published page
                <input
                  ref={linkRef}
                  readOnly
                  className="admin-input mt-2 w-full"
                  value={link}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="admin-btn-secondary w-full"
                onClick={copy}
              >
                <Copy size={15} /> Copy page link
              </button>
              <a
                className="admin-btn-ghost w-full"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open published page <ArrowUpRight size={15} />
              </a>
              {savedInShop && (
                <a
                  className="admin-btn-ghost w-full"
                  href={`${config.identity.siteUrl}/shop`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Shop <ArrowUpRight size={15} />
                </a>
              )}
              {funnelOnly && (
                <p className="admin-help">
                  Share the parent offer first. A direct link does not bypass
                  the follow-up requirement.
                </p>
              )}
            </>
          ) : (
            <p className="admin-help">
              Publish when ready to get a public share link.
            </p>
          )}
        </>
      ) : (
        <p className="admin-help">Save your draft to open a private preview.</p>
      )}
    </section>
  );
}
