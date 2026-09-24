import { useEffect, useRef, useState } from "react";
import { useLocation } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteConfig } from "@/config/SiteConfigContext";
import {
  MEASUREMENT_CHANGE,
  MEASUREMENT_CHOICE_KEY,
  MEASUREMENT_OPEN,
  browserPrivacySignal,
  configureMeasurement,
  measurementChoice,
  measurementHostAllowed,
  measurementPath,
  openMeasurementPreferences,
  recordMeasurement,
  revokeMeasurementSession,
  setMeasurementChoice,
  type MeasurementChoice,
  type MeasurementEvent,
} from "@/lib/measurement";

export function MeasurementPreferencesButton() {
  return (
    <button
      type="button"
      onClick={openMeasurementPreferences}
      className="text-xs underline underline-offset-4 text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Measurement preferences
    </button>
  );
}

/** Optional measurement is off until an anonymous visitor chooses to allow it. */
export default function PublicMeasurement() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const { identity } = useSiteConfig();
  const [choice, setChoice] = useState<MeasurementChoice>(null);
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [privacySignal, setPrivacySignal] = useState(false);
  const previous = useRef("");
  const path = measurementPath(pathname);
  const eligible =
    ready &&
    !loading &&
    !user &&
    Boolean(path) &&
    measurementHostAllowed(window.location.origin, identity.siteUrl) &&
    !new URLSearchParams(window.location.search).has("measurement");

  useEffect(() => {
    const refresh = () => {
      setChoice(measurementChoice());
      setPrivacySignal(browserPrivacySignal());
    };
    const storage = (event: StorageEvent) => {
      if (event.key === MEASUREMENT_CHOICE_KEY || event.key === null) {
        if (measurementChoice() !== "allow") revokeMeasurementSession();
        refresh();
      }
    };
    const open = () => {
      refresh();
      setOpened(true);
    };
    refresh();
    setReady(true);
    window.addEventListener(MEASUREMENT_CHANGE, refresh);
    window.addEventListener(MEASUREMENT_OPEN, open);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(MEASUREMENT_CHANGE, refresh);
      window.removeEventListener(MEASUREMENT_OPEN, open);
      window.removeEventListener("storage", storage);
    };
  }, []);

  useEffect(() => {
    configureMeasurement(eligible && !privacySignal, identity.siteUrl);
    if (!eligible || privacySignal || choice !== "allow" || !path) {
      previous.current = "";
      return;
    }
    if (previous.current !== path) {
      previous.current = path;
      const events: Array<Omit<MeasurementEvent, "id">> = [
        { type: "page_view", path },
      ];
      if (path === "/shop") events.push({ type: "shop_view", path });
      recordMeasurement(events);
    }
    // Offer content may resolve after the route. Only measure the matching published slug.
    let recorded = false;
    const offerView = () => {
      if (recorded || !path.startsWith("/offers/")) return;
      const intro = Array.from(
        document.querySelectorAll<HTMLElement>("[data-conversion-offer-slug]"),
      ).find((node) => `/offers/${node.dataset.conversionOfferSlug}` === path);
      if (!intro?.dataset.conversionOfferId) return;
      recordMeasurement([
        { type: "offer_view", path, offer_id: intro.dataset.conversionOfferId },
      ]);
      recorded = true;
    };
    offerView();
    const observer = new MutationObserver(offerView);
    if (path.startsWith("/offers/") && !recorded)
      observer.observe(document.body, { childList: true, subtree: true });
    const click = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>(
              "a[data-conversion-destination]",
            )
          : null;
      if (
        !link ||
        new URL(link.href, window.location.origin).origin ===
          window.location.origin
      )
        return;
      recordMeasurement([
        {
          type: "outbound_click",
          path,
          placement: link.dataset
            .conversionPlacement as MeasurementEvent["placement"],
          destination: link.dataset
            .conversionDestination as MeasurementEvent["destination"],
          ...(link.dataset.conversionOfferId
            ? { offer_id: link.dataset.conversionOfferId }
            : {}),
        },
      ]);
    };
    document.addEventListener("click", click, true);
    document.addEventListener("auxclick", click, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      document.removeEventListener("auxclick", click, true);
    };
  }, [eligible, privacySignal, choice, path, identity.siteUrl]);

  if (
    !ready ||
    loading ||
    user ||
    (!opened && (!eligible || choice || privacySignal))
  )
    return null;
  const choose = (value: "allow" | "decline") => {
    setMeasurementChoice(value);
    setOpened(false);
  };
  return (
    // First visit: a small bottom-left pill that stays clear of the hero
    // buttons (the explanation stays available to screen readers and on the
    // Privacy details page). Reopened from the footer: the full card.
    <section
      aria-label="Website measurement preferences"
      className={`fixed bottom-3 left-3 z-[90] max-h-[calc(100dvh-1.5rem)] overflow-y-auto border border-white/20 bg-[#121318] text-white shadow-2xl font-body ${
        opened
          ? "w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl p-4"
          : "flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-3xl px-4 py-2"
      }`}
    >
      <h2 className="text-xs font-semibold">Help improve this website?</h2>
      <p
        className={
          opened ? "mt-1.5 text-xs leading-relaxed text-white/80" : "sr-only"
        }
      >
        Optional measurement helps us understand which pages and offers are
        useful. It uses a short-lived browser session and excludes names and
        emails.
      </p>
      {privacySignal && (
        <p className="mt-1.5 text-xs text-white/80">
          Your browser’s privacy signal keeps optional measurement off.
        </p>
      )}
      <div
        className={`flex flex-wrap items-center gap-2 ${opened ? "mt-3" : ""}`}
      >
        {!privacySignal && (
          <button
            type="button"
            onClick={() => choose("allow")}
            className="min-h-10 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
          >
            Allow measurement
          </button>
        )}
        <button
          type="button"
          onClick={() => choose("decline")}
          className="min-h-10 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
        >
          {choice === "allow" ? "Turn measurement off" : "No thanks"}
        </button>
        {opened && (
          <button
            type="button"
            onClick={() => setOpened(false)}
            className="min-h-10 px-2 text-xs underline underline-offset-4"
          >
            Close
          </button>
        )}
        <a
          href="/privacy"
          className="inline-flex min-h-10 items-center px-1 text-xs underline underline-offset-4"
        >
          Privacy details
        </a>
      </div>
    </section>
  );
}
