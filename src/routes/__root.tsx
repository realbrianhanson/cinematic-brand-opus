import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AriaLiveAnnouncer } from "@/components/AriaLiveAnnouncer";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import appCss from "../styles.css?url";

// ported from main.tsx — recover from stale lazy-chunk references after a redeploy.
const RELOAD_KEY = "__chunk_reload_at";
const isChunkLoadError = (msg: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i.test(
    msg,
  );
const maybeReload = (msg: string) => {
  if (typeof window === "undefined") return;
  if (!isChunkLoadError(msg)) return;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
};

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <h1 className="font-heading text-3xl md:text-4xl mb-4 text-center">This page didn't load</h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Something went wrong while rendering this page. You can try again or go back home.
      </p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-accent"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <h1 className="font-heading text-3xl md:text-4xl mb-4 text-center">Page not found</h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        The page you're looking for doesn't exist or has been moved.
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (e: ErrorEvent) => maybeReload(e.message || "");
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = (e.reason && (e.reason.message || String(e.reason))) || "";
      maybeReload(msg);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);

    // Duplicate-domain guard: canonical site is brianhanson.com; *.lovable.app must not be indexed.
    if (window.location.hostname.endsWith("lovable.app")) {
      let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
      if (!robots) {
        robots = document.createElement("meta");
        robots.setAttribute("name", "robots");
        document.head.appendChild(robots);
      }
      robots.setAttribute("content", "noindex");
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AriaLiveAnnouncer>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Outlet />
          </TooltipProvider>
        </AriaLiveAnnouncer>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "K_UDj1XvNR1AVquMTg9QMT_LfxDmHKiPwdzM3pcOQW4" },
      { title: "Brian Hanson | Authority, Leadership, Legacy" },
      {
        name: "description",
        content:
          "Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses with applied A.I. and modern leadership.",
      },
      { property: "og:title", content: "Brian Hanson | Authority, Leadership, Legacy" },
      { name: "twitter:title", content: "Brian Hanson | Authority, Leadership, Legacy" },
      {
        property: "og:description",
        content:
          "Keynote speaker and advisor Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses through applied A.I. and modern leadership.",
      },
      {
        name: "twitter:description",
        content:
          "Keynote speaker and advisor Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses through applied A.I. and modern leadership.",
      },
      { property: "og:image", content: "https://brianhanson.com/og-default.png" },
      { name: "twitter:image", content: "https://brianhanson.com/og-default.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/webp", href: "/brian-headshot.webp" },
      { rel: "alternate", type: "application/rss+xml", title: "Brian Hanson — Blog", href: "/rss.xml" },
      { rel: "preload", as: "image", href: "/videos/hero-poster.jpg", fetchpriority: "high" },
      { rel: "preconnect", href: "https://pwjdotliwsulqktavyxf.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://pwjdotliwsulqktavyxf.supabase.co" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@400;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@400;600;700&display=swap",
        media: "print",
        onload: "this.media='all'",
      },
    ],
    scripts: [
      {
        children: `document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach(l => l.media='all');`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
