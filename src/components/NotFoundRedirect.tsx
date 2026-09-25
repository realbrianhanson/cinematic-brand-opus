import { useEffect, useRef, useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { supabaseNotFoundLookup } from "@/lib/notFoundLookup";
import { missingPageClientDestination } from "@/lib/notFoundRedirectClient";

/**
 * Not-found screen that moves the visitor on: a saved redirect rule's page,
 * when a matching rule exists. Unknown admin screens go to the admin overview. Direct
 * page loads are already redirected by the server; this covers navigation
 * inside the site. Files keep the plain not-found message.
 */
export default function NotFoundRedirect() {
  const router = useRouter();
  const { pathname, searchStr: search } = useLocation();
  const [staying, setStaying] = useState(false);
  // This marker exists before the first render only when hydrating server HTML.
  // The server already attempted to record that document's missing path.
  // Retain the exemption through StrictMode's repeated initial effect, then
  // discard it on navigation so a later visit to the same path is counted.
  const serverAttemptedLocation = useRef(
    typeof document !== "undefined" &&
      document
        .querySelector("main[data-not-found-path]")
        ?.getAttribute("data-not-found-path") === pathname
      ? pathname + search
      : null,
  );

  useEffect(() => {
    const serverAttempted =
      serverAttemptedLocation.current === pathname + search;
    if (!serverAttempted) serverAttemptedLocation.current = null;
    setStaying(false);
    const controller = new AbortController();
    let cancelled = false;
    const lookup = supabaseNotFoundLookup(supabase, controller.signal);
    void missingPageClientDestination(
      {
        pathname,
        search,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      },
      serverAttempted ? { ...lookup, record: async () => undefined } : lookup,
    ).then((destination) => {
      if (cancelled) return;
      if (destination.kind === "stay") setStaying(true);
      if (destination.kind === "navigate")
        void router.navigate({ href: destination.href, replace: true });
      if (destination.kind === "external")
        window.location.replace(destination.href);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [router, pathname, search]);

  return (
    <main
      id="main-content"
      data-not-found-path={pathname}
      className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6"
    >
      <h1 className="font-heading text-3xl md:text-4xl mb-4 text-center">
        Page not found
      </h1>
      <p
        role="status"
        className="text-muted-foreground text-center max-w-md mb-8"
      >
        {staying
          ? "This page doesn't exist or has moved"
          : "Checking whether this page has moved"}
      </p>
      <nav
        aria-label="Helpful links"
        className="flex flex-wrap justify-center gap-4"
      >
        <a
          href="/resources"
          className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-muted"
        >
          Browse resources
        </a>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </a>
      </nav>
    </main>
  );
}
