import { useEffect, useId, useRef, useState } from "react";
import ScriptInspirationGuide from "./ScriptInspirationGuide";
import {
  buildCallFunnelScriptDocument,
  buildCallFunnelScriptPrompt,
  CALL_SCRIPT_BRIEF_LIMIT,
  CALL_SCRIPT_TEXT_LIMIT,
  callScriptBriefFields,
  callScriptStages,
  estimateCallScriptRuntime,
  type CallFunnelScripts,
  type CallScriptStage,
} from "@/lib/callFunnelScripts";

type ExportKind = "prompt" | "scripts";

export default function CallScriptWorkspace({
  value,
  onChange,
  offerName = "",
  disabled = false,
}: {
  value: CallFunnelScripts;
  onChange: (value: CallFunnelScripts) => void;
  offerName?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [stage, setStage] = useState<CallScriptStage>("invitation");
  const [exportKind, setExportKind] = useState<ExportKind>("prompt");
  const [showExport, setShowExport] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const downloads = useRef(new Map<string, number>());
  const runtime = estimateCallScriptRuntime(value[stage], value.wordsPerMinute);
  const selected = callScriptStages.find((item) => item.key === stage)!;
  const exportText =
    exportKind === "prompt"
      ? buildCallFunnelScriptPrompt(value, offerName)
      : buildCallFunnelScriptDocument(value, offerName);

  useEffect(() => {
    const urls = downloads.current;
    return () => {
      for (const [url, timer] of urls) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);
  useEffect(() => {
    if (showExport && failed) {
      exportRef.current?.focus();
      exportRef.current?.select();
    }
  }, [showExport, failed, exportKind]);

  async function copy() {
    if (copying || disabled) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(exportText);
      setFailed(false);
      setNotice(
        `${exportKind === "prompt" ? "Writing prompt" : "Scripts and brief"} copied.`,
      );
    } catch {
      setFailed(true);
      setShowExport(true);
      setNotice(
        "Copy did not work in this browser. Select and copy the export text below.",
      );
    } finally {
      setCopying(false);
    }
  }

  function download() {
    if (disabled) return;
    let link: HTMLAnchorElement | undefined;
    let url: string | undefined;
    try {
      if (
        typeof URL.createObjectURL !== "function" ||
        typeof URL.revokeObjectURL !== "function"
      )
        throw new Error("Downloads unavailable");
      link = document.createElement("a");
      if (!("download" in link)) throw new Error("Downloads unavailable");
      url = URL.createObjectURL(
        new Blob([exportText], { type: "text/markdown;charset=utf-8" }),
      );
      link.href = url;
      link.download = `call-funnel-${exportKind === "prompt" ? "writing-prompt" : "video-scripts"}.md`;
      document.body.appendChild(link);
      link.click();
      setFailed(false);
      setNotice(
        "Download requested. If it did not save, use View export text below.",
      );
    } catch {
      setFailed(true);
      setShowExport(true);
      setNotice(
        "This browser could not start the download. Select and copy the export text below.",
      );
    } finally {
      link?.remove();
      if (url) {
        const pendingUrl = url;
        downloads.current.set(
          pendingUrl,
          window.setTimeout(() => {
            URL.revokeObjectURL(pendingUrl);
            downloads.current.delete(pendingUrl);
          }, 1000),
        );
      }
    }
  }

  return (
    <section
      className="admin-card p-5 space-y-5"
      aria-labelledby={`${id}-title`}
    >
      <div className="space-y-2">
        <p className="admin-eyebrow">Plan · write · record</p>
        <h3 className="text-lg font-semibold" id={`${id}-title`}>
          Video-script workspace
        </h3>
        <p className="admin-help">
          Shape your invitation, welcome and training videos around the same
          offer. Save these private notes with your funnel draft.
        </p>
      </div>
      <fieldset disabled={disabled} className="min-w-0 space-y-5">
        <legend className="sr-only">Video scripts and offer brief</legend>
        <ScriptInspirationGuide value={value} onChange={onChange} />
        <details className="rounded-xl border border-current/10 p-4">
          <summary className="cursor-pointer font-medium">Offer brief</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {callScriptBriefFields.map(({ key, label, hint }) => (
              <div
                key={key}
                className={key === "evidence" ? "md:col-span-2" : ""}
              >
                <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
                  {label}
                </label>
                <textarea
                  id={`${id}-${key}`}
                  className="admin-input mt-2 w-full min-h-11 text-base"
                  rows={3}
                  maxLength={CALL_SCRIPT_BRIEF_LIMIT}
                  value={value[key]}
                  aria-describedby={`${id}-${key}-hint`}
                  onChange={(event) =>
                    onChange({ ...value, [key]: event.target.value })
                  }
                />
                <p id={`${id}-${key}-hint`} className="admin-help mt-1">
                  {hint}
                </p>
              </div>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm font-medium flex-1 min-w-40">
            Script
            <select
              className="admin-input mt-2 w-full min-h-11 text-base"
              value={stage}
              onChange={(event) =>
                setStage(event.target.value as CallScriptStage)
              }
            >
              {callScriptStages.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Speaking pace
            <select
              className="admin-input mt-2 w-full min-h-11 text-base"
              value={value.wordsPerMinute}
              onChange={(event) =>
                onChange({
                  ...value,
                  wordsPerMinute: Number(event.target.value),
                })
              }
            >
              {Array.from(
                new Set([
                  80,
                  100,
                  120,
                  140,
                  160,
                  180,
                  200,
                  220,
                  value.wordsPerMinute,
                ]),
              )
                .sort((a, b) => a - b)
                .map((pace) => (
                  <option key={pace} value={pace}>
                    {pace} words/minute
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div>
          <label htmlFor={`${id}-script`} className="text-sm font-medium">
            {selected.label} script
          </label>
          <p id={`${id}-script-hint`} className="admin-help mt-1 mb-2">
            {selected.hint}
          </p>
          <textarea
            id={`${id}-script`}
            className="admin-input w-full min-h-72 text-base"
            rows={12}
            maxLength={CALL_SCRIPT_TEXT_LIMIT}
            value={value[stage]}
            aria-describedby={`${id}-script-hint ${id}-runtime`}
            onChange={(event) =>
              onChange({ ...value, [stage]: event.target.value })
            }
          />
          <p id={`${id}-runtime`} className="admin-help mt-2">
            {runtime.words.toLocaleString()} words · about {runtime.label} at{" "}
            {value.wordsPerMinute} words/minute. Excludes pauses and
            demonstrations.
          </p>
          <p className="admin-help">
            {value[stage].length.toLocaleString()} /{" "}
            {CALL_SCRIPT_TEXT_LIMIT.toLocaleString()} characters
          </p>
        </div>
      </fieldset>
      <div className="border-t border-current/10 pt-4 space-y-3">
        <p className="admin-help">
          The writing prompt packages your brief for a writing tool of your
          choice. Copying or downloading does not generate a script or send your
          notes anywhere.
        </p>
        <label className="block text-sm font-medium">
          Export
          <select
            className="admin-input mt-2 w-full min-h-11 text-base"
            value={exportKind}
            disabled={copying || disabled}
            onChange={(event) => {
              setExportKind(event.target.value as ExportKind);
              setNotice("");
              setFailed(false);
            }}
          >
            <option value="prompt">Writing prompt</option>
            <option value="scripts">Scripts and brief</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="admin-btn-primary min-h-11"
            disabled={copying || disabled}
            onClick={() => void copy()}
          >
            {copying ? "Copying…" : "Copy export"}
          </button>
          <button
            type="button"
            className="admin-btn-ghost min-h-11"
            disabled={disabled}
            onClick={download}
          >
            Download export
          </button>
          <button
            type="button"
            className="admin-btn-ghost min-h-11"
            aria-expanded={showExport}
            aria-controls={`${id}-export`}
            onClick={() => setShowExport(!showExport)}
          >
            {showExport ? "Hide export text" : "View export text"}
          </button>
        </div>
        {notice && (
          <p
            role={failed ? "alert" : "status"}
            className={`admin-notice ${failed ? "admin-notice-error" : ""}`}
          >
            {notice}
          </p>
        )}
        {showExport && (
          <div id={`${id}-export`}>
            <label
              htmlFor={`${id}-export-text`}
              className="text-sm font-medium"
            >
              Export text
            </label>
            <textarea
              id={`${id}-export-text`}
              ref={exportRef}
              readOnly
              className="admin-input mt-2 w-full min-h-11 text-base"
              rows={10}
              value={exportText}
              onFocus={(event) => event.target.select()}
            />
          </div>
        )}
      </div>
    </section>
  );
}
