import PublicMeasurement from "@/components/PublicMeasurement";
import PublicSiteChat from "@/components/PublicSiteChat";
import NotFoundRedirect from "@/components/NotFoundRedirect";
import { brandStyles } from "@/config/brandStyles";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AriaLiveAnnouncer } from "@/components/AriaLiveAnnouncer";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { siteConfig as fallbackConfig, type SiteConfig } from "@/config/site";
import { configFromMatches } from "@/config/runtime";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { getSiteBranding } from "@/lib/branding.functions";
import appCss from "../styles.css?url";

// getSiteBranding never throws on the server, but the server-function call
// itself can fail (network blip during client navigation, worker restart).
// Keep the last branding this runtime saw so one failure never takes the
// whole site down or flips the brand mid-session.
let lastSiteConfig: SiteConfig = fallbackConfig;
async function loadSiteConfig(): Promise<SiteConfig> {
  try {
    lastSiteConfig = await getSiteBranding();
  } catch (error) {
    console.error("[branding] root loader fell back to cached config", error);
  }
  return lastSiteConfig;
}

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
      <h1 className="font-heading text-3xl md:text-4xl mb-4 text-center">
        This page didn't load
      </h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Something went wrong while rendering this page. You can try again or go
        back home.
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

// Missing pages move on automatically: a saved redirect rule or the home page.
function NotFoundComponent() {
  return <NotFoundRedirect />;
}

function RootComponent() {
  const siteConfig = Route.useLoaderData()?.siteConfig ?? fallbackConfig;
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

    // Duplicate-domain guard: the canonical site is the configured site URL; *.lovable.app must not be indexed.
    if (
      window.location.hostname.endsWith(".lovable.app") &&
      window.location.hostname !== new URL(siteConfig.identity.siteUrl).hostname
    ) {
      let robots = document.head.querySelector<HTMLMetaElement>(
        'meta[name="robots"]',
      );
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
  }, [siteConfig.identity.siteUrl]);

  return (
    <SiteConfigContext.Provider value={siteConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AriaLiveAnnouncer>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Outlet />
              <PublicMeasurement />
              <PublicSiteChat />
            </TooltipProvider>
          </AriaLiveAnnouncer>
        </AuthProvider>
      </QueryClientProvider>
    </SiteConfigContext.Provider>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  const siteConfig = Route.useLoaderData()?.siteConfig ?? fallbackConfig;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body style={brandStyles(siteConfig.brand)}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: async () => ({ siteConfig: await loadSiteConfig() }),
    head: ({ matches }) => {
      const siteConfig = configFromMatches(matches);
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1" },
          ...(siteConfig.metadata.googleSiteVerification
            ? [
                {
                  name: "google-site-verification",
                  content: siteConfig.metadata.googleSiteVerification,
                },
              ]
            : []),
          { title: siteConfig.metadata.defaultTitle },
          {
            name: "description",
            content: siteConfig.metadata.defaultDescription,
          },
          { property: "og:title", content: siteConfig.metadata.defaultTitle },
          { name: "twitter:title", content: siteConfig.metadata.defaultTitle },
          {
            property: "og:description",
            content: siteConfig.metadata.socialDescription,
          },
          {
            name: "twitter:description",
            content: siteConfig.metadata.socialDescription,
          },
          ...(siteConfig.metadata.socialImageUrl
            ? [
                {
                  property: "og:image",
                  content: siteConfig.metadata.socialImageUrl,
                },
                {
                  name: "twitter:image",
                  content: siteConfig.metadata.socialImageUrl,
                },
              ]
            : []),
          { name: "twitter:card", content: "summary_large_image" },
          { property: "og:type", content: "website" },
        ],
        links: [
          { rel: "stylesheet", href: appCss },
          ...(siteConfig.metadata.faviconHref
            ? [
                {
                  rel: "icon",
                  href: siteConfig.metadata.faviconHref,
                },
              ]
            : [{ rel: "icon", href: "data:," }]),
          ...(siteConfig.metadata.appleTouchIconHref
            ? [
                {
                  rel: "apple-touch-icon",
                  sizes: "180x180",
                  href: siteConfig.metadata.appleTouchIconHref,
                },
              ]
            : []),
          {
            rel: "alternate",
            type: "application/rss+xml",
            title: siteConfig.metadata.rssTitle,
            href: "/rss.xml",
          },
          ...(import.meta.env.VITE_SUPABASE_URL
            ? [
                {
                  rel: "preconnect",
                  href: new URL(import.meta.env.VITE_SUPABASE_URL).origin,
                  crossOrigin: "anonymous" as const,
                },
                {
                  rel: "dns-prefetch",
                  href: new URL(import.meta.env.VITE_SUPABASE_URL).origin,
                },
              ]
            : []),
          { rel: "preconnect", href: "https://fonts.googleapis.com" },
          {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossOrigin: "anonymous",
          },
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
      };
    },
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);
