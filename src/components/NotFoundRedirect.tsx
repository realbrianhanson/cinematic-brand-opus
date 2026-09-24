import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { supabaseNotFoundLookup } from "@/lib/notFoundLookup";
import { missingPageClientDestination } from "@/lib/notFoundRedirectClient";

/**
 * Not-found screen that moves the visitor on: a saved redirect rule's page,
 * or the home page. Unknown admin screens go to the admin overview. Direct
 * page loads are already redirected by the server; this covers navigation
 * inside the site. Files keep the plain not-found message.
 */
export default function NotFoundRedirect() {
  const router = useRouter();
  const [staying, setStaying] = useState(false);

  useEffect(() => {
    const { pathname, search } = window.location;
    const controller = new AbortController();
    let cancelled = false;
    void missingPageClientDestination(
      {
        pathname,
        search,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
      },
      supabaseNotFoundLookup(supabase, controller.signal),
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
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <h1 className="font-heading text-3xl md:text-4xl mb-4 text-center">
        Page not found
      </h1>
      <p
        role="status"
        className="text-muted-foreground text-center max-w-md mb-8"
      >
        {staying
          ? "This page doesn't exist or has moved"
          : "Taking you to the home page"}
      </p>
      <a
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </a>
    </div>
  );
}
