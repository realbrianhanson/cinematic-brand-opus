import type { ReactNode } from "react";
import { useSiteConfig } from "@/config/SiteConfigContext";

export default function OfferShell({ children }: { children: ReactNode }) {
  const config = useSiteConfig();
  return (
    <div
      className="min-h-screen font-body text-white"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <header className="mx-auto max-w-6xl px-6 py-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <a
          href="/"
          className="inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span
            className="border px-3 py-2 font-display text-xl"
            style={{
              borderColor: "var(--brand-accent)",
              color: "var(--brand-accent)",
            }}
          >
            {config.identity.logoInitials}
          </span>
          <span className="font-semibold tracking-wide">
            {config.identity.name}
          </span>
        </a>
        <a
          href="/shop"
          className="text-sm text-white/70 hover:text-white underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Browse the Shop
        </a>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-10 lg:py-16">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-6 py-8 border-t border-white/10 text-sm text-white/70 flex flex-wrap justify-between gap-4">
        <a href="/">{config.identity.name}</a>
        <a href="/shop" className="underline underline-offset-4">
          Browse the Shop
        </a>
        {config.identity.contactEmail && (
          <a href={`mailto:${config.identity.contactEmail}`}>
            Need help? Contact us
          </a>
        )}
      </footer>
    </div>
  );
}
