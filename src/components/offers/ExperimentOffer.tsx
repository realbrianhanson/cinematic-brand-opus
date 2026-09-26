import { useEffect, useRef, useState } from "react";
import OfferLanding from "@/pages/OfferLanding";
import {
  applyExperimentCopy,
  requestExperiment,
  type ExperimentDecision,
} from "@/lib/offerExperiments";
import {
  MEASUREMENT_CHANGE,
  measurementAllowed,
  measurementForClaim,
} from "@/lib/measurement";
import type { PublicOffer } from "@/lib/offers";
import type { ShopOffer } from "@/lib/shop";

type ExperimentOfferProps = { offer: PublicOffer; relatedOffers?: ShopOffer[] };
/** A source revision owns its decision; route reuse cannot carry another offer's copy. */
export default function ExperimentOffer(props: ExperimentOfferProps) {
  return (
    <ExperimentOfferSession
      key={`${props.offer.id}:${props.offer.updated_at}`}
      {...props}
    />
  );
}
/** Optional copy tests never delay checkout or replace copy after interaction. */
function ExperimentOfferSession({
  offer,
  relatedOffers,
}: ExperimentOfferProps) {
  const [decision, setDecision] = useState<ExperimentDecision | null>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (offer.checkout_mode !== "native") return;
    let active = true,
      interacted = false;
    const controller = new AbortController();
    const interactedWithPage = () => {
      interacted = true;
      controller.abort();
    };
    const changed = () => {
      if (!measurementAllowed()) {
        controller.abort();
        setDecision(null);
      }
    };
    window.addEventListener("pointerdown", interactedWithPage, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", interactedWithPage, {
      once: true,
      capture: true,
    });
    window.addEventListener(MEASUREMENT_CHANGE, changed);
    // Allow the central eligibility effect and normal offer-view collection to run.
    const timer = window.setTimeout(async () => {
      if (!measurementAllowed() || interacted) return;
      const context = await measurementForClaim();
      if (!context || !active || interacted) return;
      try {
        const result = await requestExperiment(
          offer.id,
          context,
          controller.signal,
        );
        if (active && !interacted && measurementAllowed()) setDecision(result);
      } catch {
        /* The published offer remains fully usable. */
      }
    }, 50);
    const deadline = window.setTimeout(() => controller.abort(), 1500);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearTimeout(deadline);
      window.removeEventListener("pointerdown", interactedWithPage, true);
      window.removeEventListener("keydown", interactedWithPage, true);
      window.removeEventListener(MEASUREMENT_CHANGE, changed);
    };
  }, [offer.id, offer.checkout_mode]);
  useEffect(() => {
    if (
      !decision ||
      !host.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const heading = host.current.querySelector("h1");
    if (!heading) return;
    const controller = new AbortController();
    let sent = false,
      visible = false;
    const expose = async () => {
      if (
        sent ||
        !visible ||
        document.visibilityState !== "visible" ||
        !measurementAllowed()
      )
        return;
      sent = true;
      const context = await measurementForClaim();
      if (!context || controller.signal.aborted) return;
      const deadline = setTimeout(() => controller.abort(), 1500);
      try {
        await requestExperiment(offer.id, context, controller.signal, decision);
      } catch {
        /* No exposure credit on failure. */
      } finally {
        clearTimeout(deadline);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        void expose();
      },
      { threshold: 0.5 },
    );
    observer.observe(heading);
    document.addEventListener("visibilitychange", expose);
    return () => {
      controller.abort();
      observer.disconnect();
      document.removeEventListener("visibilitychange", expose);
    };
  }, [decision, offer.id]);
  return (
    <div ref={host}>
      <OfferLanding
        offer={decision ? applyExperimentCopy(offer, decision.copy) : offer}
        relatedOffers={relatedOffers}
      />
    </div>
  );
}
