import { useRef, useState, type FormEvent } from "react";
import { invokeOfferApi } from "@/lib/offers";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function OfferRecovery() {
  const { footer } = useSiteConfig();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const form = new FormData(event.currentTarget);
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await invokeOfferApi<{ accepted: boolean }>({
        action: "recover",
        email: String(form.get("email") ?? ""),
        website: String(form.get("website") ?? ""),
      });
      if (result.accepted !== true)
        throw new Error("Recovery could not be requested. Please try again.");
      setAccepted(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Recovery could not be requested.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="recovery-heading"
      className="mt-8 rounded-lg border border-white/20 p-6 md:p-8"
    >
      <h2 id="recovery-heading" className="font-display text-2xl">
        Find your downloads
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-white/75">
        Use the email address entered when you requested or purchased a download
        on this website. Purchases made on another website stay with that
        provider.
      </p>
      {accepted ? (
        <p role="status" className="mt-5 text-green-200">
          If eligible downloads match that address, we’ll send private access
          links. Check your inbox and spam folder. For privacy, we can’t confirm
          whether an address has downloads. If no email arrives, contact
          support.
        </p>
      ) : (
        <form method="post" onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium" htmlFor="recovery-email">
            Email address
            <input
              id="recovery-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className="mt-2 block w-full rounded border border-white/25 bg-white/5 px-4 py-3"
              disabled={busy}
            />
          </label>
          <div hidden aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <button
            disabled={busy}
            className="rounded px-5 py-3 font-semibold disabled:opacity-50"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-backdrop)",
            }}
          >
            {busy ? "Requesting…" : "Email my access links"}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          {footer.privacyUrl && (
            <a
              href={footer.privacyUrl}
              className="block text-xs underline underline-offset-4 text-white/70"
            >
              Privacy policy
            </a>
          )}
        </form>
      )}
      <a
        href="/support"
        className="mt-5 inline-block text-sm underline underline-offset-4"
      >
        Contact support
      </a>
    </section>
  );
}
