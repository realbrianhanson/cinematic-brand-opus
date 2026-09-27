import { useId } from "react";
import type { CallFunnelScripts } from "@/lib/callFunnelScripts";
import {
  INSPIRATION_NOTE_LIMIT,
  INSPIRATION_SOURCES,
  INVITATION_PACING,
  isInspirationSource,
  RECORDING_PLAN,
} from "@/lib/inspirationGuidance";

export default function ScriptInspirationGuide({
  value,
  onChange,
}: {
  value: CallFunnelScripts;
  onChange: (value: CallFunnelScripts) => void;
}) {
  const id = useId();
  const selected = INSPIRATION_SOURCES.find(
    (source) => source.id === value.inspirationSource,
  );
  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <h4 className="text-lg font-semibold" id={`${id}-title`}>
        Turn research into original copy
      </h4>
      <p className="admin-help">
        These notes save with your private draft. Choosing a source does not
        replace your scripts or sync changes to a research spreadsheet.
      </p>
      <label className="block text-sm font-medium">
        Researched pattern
        <select
          className="admin-input mt-2 w-full min-h-11 text-base"
          value={value.inspirationSource}
          onChange={(event) => {
            if (isInspirationSource(event.target.value))
              onChange({ ...value, inspirationSource: event.target.value });
          }}
        >
          <option value="">Use my own brief</option>
          {INSPIRATION_SOURCES.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="space-y-2 text-base">
          <p>
            <strong>Reviewed structure:</strong> {selected.observed}
          </p>
          <p>
            <strong>Your original adaptation:</strong> {selected.adaptation}
          </p>
          <p>
            <strong>Placement:</strong> {selected.placement}
          </p>
          <p>{selected.prompt}</p>
          <a
            className="inline-flex min-h-11 items-center underline"
            href={selected.url}
            target="_blank"
            rel="noreferrer"
          >
            View source page (opens in a new tab)
          </a>
        </div>
      )}
      <label className="block text-sm font-medium" htmlFor={`${id}-adaptation`}>
        My original adaptation
      </label>
      <textarea
        id={`${id}-adaptation`}
        className="admin-input w-full min-h-11 text-base"
        rows={3}
        maxLength={INSPIRATION_NOTE_LIMIT}
        value={value.inspirationPattern}
        aria-describedby={`${id}-adaptation-hint`}
        onChange={(event) =>
          onChange({ ...value, inspirationPattern: event.target.value })
        }
      />
      <p className="admin-help" id={`${id}-adaptation-hint`}>
        What will you change, using your own offer facts and voice?
      </p>
      <label className="block text-sm font-medium" htmlFor={`${id}-experiment`}>
        Private experiment note
      </label>
      <textarea
        id={`${id}-experiment`}
        className="admin-input w-full min-h-11 text-base"
        rows={3}
        maxLength={INSPIRATION_NOTE_LIMIT}
        value={value.experimentNote}
        aria-describedby={`${id}-experiment-hint`}
        onChange={(event) =>
          onChange({ ...value, experimentNote: event.target.value })
        }
      />
      <p className="admin-help" id={`${id}-experiment-hint`}>
        Record the hypothesis, page, metric and eventual result. This stays out
        of the writing prompt and is never treated as customer proof.
      </p>
      <details className="border-t border-current/10 pt-3">
        <summary className="min-h-11 cursor-pointer font-medium">
          Six-beat pacing and recording guide
        </summary>
        <p className="mt-3 text-base">{RECORDING_PLAN}</p>
        <p className="mt-3 text-base">
          These are adjustable shares of the invitation's speaking time. Keep an
          early invitation if it fits your established sequence.
        </p>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-base">
          {INVITATION_PACING.map((beat) => (
            <li key={beat.title}>
              <strong>
                {beat.title} · {beat.percent}%
              </strong>
              <p>{beat.guidance}</p>
              <p>Optional transition: “{beat.transition}”</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-base">
          For each objection answer: question → direct answer → reason or
          approved example → limitation → next step. Use agreement checks only
          when they sound natural.
        </p>
      </details>
    </section>
  );
}
