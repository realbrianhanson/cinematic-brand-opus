import { MeasurementPreferencesButton } from "@/components/PublicMeasurement";
import type { ReactNode } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function OfferShell({
  children,
  focused = false,
  preview = false,
}: {
  children: ReactNode;
  focused?: boolean;
  preview?: boolean;
}) {
  const config = useSiteConfig();
  return (
    <div
      className="min-h-screen font-body text-white"
      style={{ background: "var(--site-surface, var(--brand-backdrop))" }}
    >
      <header className="mx-auto max-w-6xl px-6 py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <a
          href={preview ? undefined : "/"}
          aria-label={`${config.identity.name} home`}
          className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center border-[1.5px] border-[rgba(var(--brand-accent-rgb),0.6)] font-display text-base italic leading-none text-[var(--brand-accent)]"
          >
            {config.identity.logoUrl ? (
              <img
                src={config.identity.logoUrl}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              config.identity.logoInitials
            )}
          </span>
          <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-white/90">
            {config.identity.name}
          </span>
        </a>
        {!focused && (
          <nav
            aria-label="Site"
            className="flex items-center gap-6 font-body text-xs font-semibold uppercase tracking-[0.14em]"
          >
            <a
              href={preview ? undefined : "/"}
              className="text-white/75 transition-colors hover:text-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Home
            </a>
            <a
              href={preview ? undefined : "/shop"}
              className="text-white/75 transition-colors hover:text-[var(--brand-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Shop
            </a>
          </nav>
        )}
      </header>
      <main
        id="main-content"
        className="@container mx-auto max-w-6xl px-6 py-10 lg:py-16"
      >
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-6 py-8 border-t border-white/10 text-sm text-white/70 flex flex-wrap justify-between gap-4">
        <a href={preview ? undefined : "/"}>{config.identity.name}</a>
        {!focused && (
          <a
            href={preview ? undefined : "/shop"}
            className="underline underline-offset-4"
          >
            Browse the Shop
          </a>
        )}
        <a
          href={preview ? undefined : "/support"}
          className="underline underline-offset-4"
        >
          Help with access
        </a>
        {config.footer.privacyUrl && (
          <a
            href={preview ? undefined : config.footer.privacyUrl}
            className="underline underline-offset-4"
          >
            Privacy
          </a>
        )}
        {config.footer.termsUrl && (
          <a
            href={preview ? undefined : config.footer.termsUrl}
            className="underline underline-offset-4"
          >
            Terms
          </a>
        )}
        {!preview && <MeasurementPreferencesButton />}
      </footer>
    </div>
  );
}
