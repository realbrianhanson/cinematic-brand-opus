import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { CallShowcase, ResultStat } from "@/config/types";
import {
  callUrl,
  type CallFunnelConfig,
} from "../../../supabase/functions/_shared/callFunnels";

function statValue(stat: ResultStat) {
  const value = stat.locale
    ? stat.end.toLocaleString("en-US")
    : String(stat.end);
  return `${stat.prefix ?? ""}${value}${stat.suffix ?? ""}`;
}

export function ResultsRow({ results }: { results: ResultStat[] }) {
  if (!results.length) return null;
  return (
    <ul className="cf-results" aria-label="Track record">
      {results.map((stat) => (
        <li key={stat.label}>
          <span className="cf-result-value">{statValue(stat)}</span>
          <span className="cf-result-label">{stat.label}</span>
          <span className="cf-result-sub">{stat.sub}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The stages read left to right as one connected line. The connectors draw
 * once, the first time the stages scroll into view.
 */
export function SystemSection({
  system,
}: {
  system: NonNullable<CallShowcase["system"]>;
}) {
  const headingId = useId();
  const stagesRef = useRef<HTMLOListElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const node = stagesRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setDrawn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      // Threshold 0 still fires when the list is taller than the screen.
      { threshold: 0, rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="cf-system" aria-labelledby={headingId}>
      <div className="cf-wide">
        <div className="cf-section-intro">
          <h2 id={headingId}>{system.heading}</h2>
          <p>{system.intro}</p>
        </div>
        <ol
          ref={stagesRef}
          className={`cf-stages${drawn ? " is-drawn" : ""}`}
          style={{ "--cf-stage-count": system.stages.length } as CSSProperties}
        >
          {system.stages.map((stage, index) => (
            <li
              key={stage.title}
              className="cf-stage"
              style={{ "--cf-stage-index": index } as CSSProperties}
            >
              <span className="cf-stage-marker" aria-hidden="true">
                {index + 1}
              </span>
              <div className="cf-stage-card">
                <h3>{stage.title}</h3>
                <p>{stage.text}</p>
                {stage.items.length > 0 && (
                  <ul>
                    {stage.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
        {system.note && <p className="cf-system-note">{system.note}</p>}
      </div>
    </section>
  );
}

export function StepList({
  steps,
}: {
  steps: NonNullable<CallShowcase["steps"]>;
}) {
  return (
    <ol className="cf-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="cf-step-marker" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The person the applicant will meet, shown wherever they decide to book. */
export function HostCard({
  brand,
  label,
  photo = true,
  photos,
}: {
  brand: CallFunnelConfig["brand"];
  label: string;
  /** Off where the page already shows the host's portrait. */
  photo?: boolean;
  /** Named portraits that replace the host's, such as the team who runs the call. */
  photos?: Array<{ src: string; alt: string }>;
}) {
  if (!brand.hostName && !brand.hostBio) return null;
  const team = (photos ?? []).filter((p) => callUrl(p.src, true)).slice(0, 2);
  const image =
    !team.length && photo && brand.hostImage && callUrl(brand.hostImage, true);
  return (
    <div className="cf-host-card">
      {team.length > 0 && (
        <div
          className={
            team.length > 1
              ? "cf-host-card-photos cf-host-card-photos-pair"
              : "cf-host-card-photos"
          }
        >
          {team.map((p) => (
            <img
              key={p.src}
              src={p.src}
              alt={p.alt}
              width={96}
              height={96}
              loading="lazy"
            />
          ))}
        </div>
      )}
      {image && (
        <img
          src={brand.hostImage}
          alt=""
          width={96}
          height={96}
          loading="lazy"
        />
      )}
      <div>
        <p className="cf-host-card-label">{label}</p>
        {brand.hostName && (
          <p className="cf-host-card-name">{brand.hostName}</p>
        )}
        {brand.hostRole && (
          <p className="cf-host-card-role">{brand.hostRole}</p>
        )}
        {brand.hostBio && <p className="cf-host-card-bio">{brand.hostBio}</p>}
      </div>
    </div>
  );
}
