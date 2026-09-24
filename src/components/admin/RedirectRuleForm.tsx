import { useEffect, useId, useRef, useState } from "react";
import { validateRuleDraft, type RuleDraft } from "./redirectsData";

type Props = {
  initial: {
    from_path: string;
    to_path: string;
    status_code: number;
    note: string | null;
  };
  /** False when the old address is fixed (a missing page or an existing rule). */
  fromEditable: boolean;
  suggestionsId: string;
  busy: boolean;
  serverError: string | null;
  onSubmit: (draft: RuleDraft) => void;
  onCancel: () => void;
};

export default function RedirectRuleForm({
  initial,
  fromEditable,
  suggestionsId,
  busy,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId();
  const [from, setFrom] = useState(initial.from_path);
  const [to, setTo] = useState(initial.to_path);
  const [status, setStatus] = useState(initial.status_code === 302 ? 302 : 301);
  const [note, setNote] = useState(initial.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const targetField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (fromEditable ? firstField : targetField).current?.focus();
  }, [fromEditable]);

  const message = error ?? serverError;

  return (
    <form
      className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const result = validateRuleDraft({
          from_path: from,
          to_path: to,
          status_code: status,
          note,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        onSubmit(result.value);
      }}
    >
      {fromEditable ? (
        <label className="block text-sm font-medium" htmlFor={`${id}-from`}>
          Old address
          <input
            id={`${id}-from`}
            ref={firstField}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder="/old-page"
            className="admin-input mt-2 w-full"
            autoComplete="off"
            spellCheck={false}
            maxLength={512}
          />
        </label>
      ) : (
        <div className="text-sm">
          <p className="font-medium">Old address</p>
          <p className="mt-2 break-all font-mono text-muted-foreground">
            {from}
          </p>
        </div>
      )}
      <div className="text-sm">
        <label className="block font-medium" htmlFor={`${id}-to`}>
          Send visitors to
        </label>
        <input
          id={`${id}-to`}
          ref={targetField}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          list={suggestionsId}
          placeholder="/about or https://…"
          className="admin-input mt-2 w-full"
          autoComplete="off"
          spellCheck={false}
          maxLength={2048}
          aria-describedby={`${id}-to-help`}
        />
        <span id={`${id}-to-help`} className="admin-help mt-1 block">
          Start typing to pick one of your pages
        </span>
      </div>
      <div className="text-sm">
        <label className="block font-medium" htmlFor={`${id}-status`}>
          Redirect type
        </label>
        <select
          id={`${id}-status`}
          value={status}
          onChange={(event) =>
            setStatus(event.target.value === "302" ? 302 : 301)
          }
          className="admin-input mt-2 w-full"
          aria-describedby={`${id}-status-help`}
        >
          <option value="301">Permanent (301)</option>
          <option value="302">Temporary (302)</option>
        </select>
        <span id={`${id}-status-help`} className="admin-help mt-1 block">
          Use permanent when the old page is gone for good
        </span>
      </div>
      <label className="block text-sm font-medium" htmlFor={`${id}-note`}>
        Note (optional)
        <input
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="admin-input mt-2 w-full"
          maxLength={500}
        />
      </label>
      {message && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="admin-btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save redirect"}
        </button>
        <button
          type="button"
          className="admin-btn-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
