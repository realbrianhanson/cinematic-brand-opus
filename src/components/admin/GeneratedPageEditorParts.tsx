import { useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Sparkles, Wand2 } from "lucide-react";
import { MIN_OVERRIDE_REASON } from "./manualPublishClient";

/** Modal shell shared by the editor's confirm and override dialogs. */
export function EditorDialog({
  labelledBy,
  children,
  maxWidth = 480,
}: {
  labelledBy: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="admin-card"
        style={{ maxWidth, width: "90%", padding: 28 }}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  id,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  id: string;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <EditorDialog labelledBy={id}>
      <h3
        id={id}
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 12,
        }}
      >
        {title}
      </h3>
      <p
        className="font-body"
        style={{
          fontSize: 13,
          color: "hsl(var(--admin-text-soft))",
          marginBottom: 20,
        }}
      >
        {body}
      </p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} disabled={busy} className="admin-btn-ghost">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="admin-btn-primary"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </EditorDialog>
  );
}

/** Shown when the server score is below 75: back to draft, or publish with a reason. */
export function QualityWarningDialog({
  score,
  issues,
  busy,
  onBackToDraft,
  onPublishAnyway,
}: {
  score: number;
  issues: string[];
  busy: boolean;
  onBackToDraft: () => void;
  onPublishAnyway: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= MIN_OVERRIDE_REASON;
  return (
    <EditorDialog labelledBy="quality-warning-title">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle
          size={22}
          aria-hidden
          style={{ color: "hsl(var(--admin-warning, 40 90% 50%))" }}
        />
        <h3
          id="quality-warning-title"
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "hsl(var(--admin-text))",
          }}
        >
          Low Quality Score: {score}/100
        </h3>
      </div>
      <p
        className="font-body"
        style={{
          fontSize: 13,
          color: "hsl(var(--admin-text-soft))",
          marginBottom: 16,
        }}
      >
        Your edits are saved, but the page stays unpublished: it scored below
        the publish threshold of 75.
      </p>
      <ul style={{ marginBottom: 16, paddingLeft: 16 }}>
        {issues.map((issue, i) => (
          <li
            key={i}
            className="font-body"
            style={{
              fontSize: 12,
              color: "hsl(var(--admin-text-ghost))",
              marginBottom: 4,
              listStyle: "disc",
            }}
          >
            {issue}
          </li>
        ))}
      </ul>
      <label
        htmlFor="override-reason"
        className="admin-label"
        style={{ fontSize: 11 }}
      >
        Reason to publish anyway (logged, at least {MIN_OVERRIDE_REASON}{" "}
        characters)
      </label>
      <textarea
        id="override-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="admin-input font-body w-full"
        style={{ marginBottom: 16, resize: "vertical" }}
      />
      <div className="flex gap-3 justify-end">
        <button
          onClick={onBackToDraft}
          disabled={busy}
          className="admin-btn-ghost"
        >
          Keep as Draft
        </button>
        <button
          onClick={() => onPublishAnyway(reason.trim())}
          disabled={!ready || busy}
          className="admin-btn-primary"
          style={{ background: "hsl(var(--admin-warning, 40 90% 50%))" }}
        >
          {busy ? "Publishing..." : "Publish anyway"}
        </button>
      </div>
    </EditorDialog>
  );
}

export interface SeoCriterion {
  label: string;
  done: boolean;
  points: string;
}

/** Formatting-completeness helper (not a ranking prediction). */
export function SeoHelperCard({
  score,
  criteria,
  hasGenerated,
  aiGenerating,
  enhancing,
  onGenerate,
  onEnhance,
}: {
  score: number;
  criteria: SeoCriterion[];
  hasGenerated: boolean;
  aiGenerating: boolean;
  enhancing: boolean;
  onGenerate: () => void;
  onEnhance: () => void;
}) {
  const done = criteria.filter((c) => c.done).length;
  const total = criteria.length;
  const scoreColor =
    score >= 75 ? "admin-sage" : score >= 40 ? "admin-accent" : "admin-danger";
  return (
    <div className="admin-card" style={{ padding: 20 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Wand2
          size={14}
          aria-hidden
          style={{ color: "hsl(var(--admin-accent))" }}
        />
        <span className="admin-label" style={{ marginBottom: 0 }}>
          AI. SEO Helper
        </span>
      </div>
      <p
        className="font-body"
        style={{
          fontSize: 11,
          color: "hsl(var(--admin-text-ghost))",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        Generate &amp; optimize SEO fields using AI based on your page content.
      </p>

      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <div
          style={{
            position: "relative",
            width: 100,
            height: 100,
            margin: "0 auto 10px",
          }}
        >
          <svg
            viewBox="0 0 36 36"
            aria-hidden
            style={{
              width: "100%",
              height: "100%",
              transform: "rotate(-90deg)",
            }}
          >
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="hsl(var(--admin-surface-2))"
              strokeWidth="2.8"
            />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={`hsl(var(--${scoreColor}))`}
              strokeWidth="2.8"
              strokeDasharray={`${score} ${100 - score}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="font-heading"
              style={{
                fontSize: 24,
                color: `hsl(var(--${scoreColor}))`,
                lineHeight: 1,
              }}
            >
              {score}
            </span>
            <span
              className="font-body"
              style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))" }}
            >
              / 100
            </span>
          </div>
        </div>
        <p
          className="font-body"
          style={{
            fontSize: 10,
            color: "hsl(var(--admin-text-ghost))",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Formatting completeness
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <p className="admin-label" style={{ marginBottom: 10, fontSize: 10 }}>
          📈 Increase Your Score
        </p>
        <div
          style={{
            backgroundColor: "hsl(var(--admin-surface-2))",
            borderRadius: 6,
            padding: "4px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background:
                done === total
                  ? "hsl(var(--admin-sage))"
                  : "linear-gradient(90deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
              width: `${(done / total) * 100}%`,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <p
          className="font-body"
          style={{
            fontSize: 10,
            color: "hsl(var(--admin-text-ghost))",
            marginBottom: 10,
            textAlign: "right",
          }}
        >
          {done}/{total} completed
        </p>
        {criteria.map((c) => (
          <div
            key={c.label}
            data-done={c.done ? "true" : "false"}
            className="flex items-start gap-2"
            style={{ marginBottom: 6 }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 13,
                lineHeight: "18px",
                flexShrink: 0,
                color: c.done
                  ? "hsl(var(--admin-sage))"
                  : "hsl(var(--admin-text-ghost))",
              }}
            >
              {c.done ? "✓" : "○"}
            </span>
            <span
              className="font-body"
              style={{
                fontSize: 11,
                lineHeight: "18px",
                flex: 1,
                color: c.done
                  ? "hsl(var(--admin-text-ghost))"
                  : "hsl(var(--admin-text-soft))",
                textDecoration: c.done ? "line-through" : "none",
              }}
            >
              {c.label}
            </span>
            <span
              className="font-body"
              style={{
                fontSize: 9,
                lineHeight: "18px",
                color: c.done
                  ? "hsl(var(--admin-sage))"
                  : "hsl(var(--admin-accent))",
                fontWeight: 600,
              }}
            >
              {c.done ? "✓" : c.points}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onGenerate}
        disabled={aiGenerating}
        className="admin-btn-primary w-full flex items-center justify-center gap-2"
        style={{ fontSize: 13 }}
      >
        {aiGenerating ? (
          <>
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Generating...
          </>
        ) : (
          <>
            <Sparkles size={14} aria-hidden />
            Generate SEO
          </>
        )}
      </button>

      {hasGenerated && (
        <button
          onClick={onEnhance}
          disabled={enhancing}
          className="w-full flex items-center justify-center gap-2 font-body"
          style={{
            marginTop: 8,
            background: enhancing
              ? "hsl(var(--admin-surface-2))"
              : "linear-gradient(135deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
            color: enhancing ? "hsl(var(--admin-text-ghost))" : "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: enhancing ? "not-allowed" : "pointer",
          }}
        >
          {enhancing ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Enhancing...
            </>
          ) : (
            <>
              📈 Increase Score{" "}
              <span
                style={{
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                {score}%
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
