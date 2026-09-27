import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  callUrl,
  type CallPreparationExtras as Extras,
} from "@/lib/callFunnels";
import CallVideo from "./CallVideo";

function Answer({
  item,
  preview,
}: {
  item: Extras["objections"]["items"][number];
  preview: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{item.question}</summary>
      <p className="cf-answer-copy">{item.answer}</p>
      {open &&
        (item.video.url ||
          item.video.transcript ||
          (preview && item.video.poster)) && (
          <CallVideo
            media={item.video}
            title={item.question}
            preview={preview}
            captions={item.captions}
          />
        )}
    </details>
  );
}

export default function CallPreparationExtras({
  extras,
  preview,
}: {
  extras?: Extras;
  preview: boolean;
}) {
  if (!extras) return null;
  const { overview, objections } = extras;
  const items = objections.items.filter(
    (item) => item.enabled && item.question.trim(),
  );
  const overviewReady = !!overview.url && callUrl(overview.url);
  return (
    <>
      {overview.enabled && (overviewReady || preview) && (
        <section className="cf-offer-overview">
          <h2>{overview.heading}</h2>
          {overview.description && <p>{overview.description}</p>}
          {preview ? (
            <>
              <button type="button" className="cf-secondary-button" disabled>
                {overview.button} <ArrowUpRight size={18} aria-hidden="true" />
              </button>
              <p className="cf-small cf-muted">
                {overviewReady
                  ? "External actions are disabled in preview."
                  : "Add the offer overview link in Preparation settings."}
              </p>
            </>
          ) : (
            <a
              className="cf-secondary-button"
              href={overview.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {overview.button} <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
        </section>
      )}
      {objections.enabled && items.length > 0 && (
        <section className="cf-faq cf-preparation-answers">
          <h2>{objections.heading}</h2>
          {objections.intro && <p className="cf-muted">{objections.intro}</p>}
          {items.map((item, index) => (
            <Answer
              key={`${index}-${item.question}`}
              item={item}
              preview={preview}
            />
          ))}
        </section>
      )}
    </>
  );
}
