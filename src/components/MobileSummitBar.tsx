import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { summitHref } from "@/lib/summitLink";
import { useLocation } from "@/lib/router-compat";

export const MOBILE_BAR_DISMISS_KEY = "mobile-summit-bar-dismissed-v1";
/** Page offset for other fixed widgets (the chat button) while the bar shows. */
export const MOBILE_BAR_SPACE_VAR = "--mobile-bar-space";
const PILL_SELECTOR = "[data-measurement-pill]";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(MOBILE_BAR_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed() {
  try {
    sessionStorage.setItem(MOBILE_BAR_DISMISS_KEY, "1");
  } catch {
    /* Dismissal still holds for this page view. */
  }
}

/**
 * Null hides the bar while the measurement prompt waits for an answer, so a
 * phone never shows the bar, the prompt and chat stacked over the page.
 */
function pillSpace(): number | null {
  return document.querySelector(PILL_SELECTOR) ? null : 0;
}

/**
 * Slim Summit bar for phones (<768px). Rendered from the public footer, so it
 * never appears in the admin or on offer checkout and access pages. It waits
 * until the visitor scrolls past the first screen and answers the measurement
 * prompt, and can be dismissed for the session.
 */
export default function MobileSummitBar() {
  const { pathname } = useLocation();
  const focused = pathname.replace(/\/+$/, "") === "/first-ai-build";
  const { sections, event } = useSiteConfig();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [offset, setOffset] = useState<number | null>(0);
  const bar = useRef<HTMLDivElement>(null);
  const cta = sections.event ? event.cta : null;

  useEffect(() => {
    setMounted(true);
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    if (!cta || focused) return;
    const onScroll = () =>
      setScrolled(window.scrollY > window.innerHeight * 0.6);
    const measure = () => setOffset(pillSpace());
    onScroll();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [cta, focused]);

  const visible =
    mounted && !!cta && !focused && !dismissed && scrolled && offset !== null;

  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const phone = window.matchMedia?.("(max-width: 767px)").matches ?? false;
      const height = bar.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty(
        MOBILE_BAR_SPACE_VAR,
        visible && phone ? `${height + (offset ?? 0)}px` : "0px",
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (bar.current) observer?.observe(bar.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      root.style.removeProperty(MOBILE_BAR_SPACE_VAR);
    };
  }, [visible, offset]);

  if (!visible || !cta) return null;

  return (
    <>
      <div aria-hidden="true" className="h-16 md:hidden" />
      <div
        ref={bar}
        role="region"
        aria-label="Free AI Summit"
        className="public-site fixed inset-x-0 z-40 flex items-center gap-2 border-t border-[rgba(var(--brand-accent-rgb),0.3)] bg-[var(--site-nav-scrolled,rgba(var(--brand-backdrop-rgb),0.96))] py-2 pl-4 pr-2 backdrop-blur md:hidden print:hidden"
        style={{ bottom: offset ?? 0 }}
      >
        <a
          href={summitHref(cta.href, "sticky")}
          target={cta.external ? "_blank" : undefined}
          rel={cta.external ? "noopener noreferrer" : undefined}
          data-conversion-destination="summit"
          data-conversion-placement="other"
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3"
        >
          <span className="truncate font-body text-meta font-semibold text-white">
            Free AI Summit
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 bg-[var(--brand-accent)] px-3 py-2 font-body text-label font-bold text-[var(--brand-backdrop)]">
            {cta.label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </a>
        <button
          type="button"
          onClick={() => {
            saveDismissed();
            setDismissed(true);
          }}
          aria-label="Dismiss the Summit bar"
          className="flex h-11 w-11 shrink-0 items-center justify-center text-white/75 hover:text-white"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
