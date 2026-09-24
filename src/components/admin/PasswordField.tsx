import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  invalid?: boolean;
}

/** Labelled password input with a named, stateful show/hide toggle. */
const PasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
}: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);
  const name = label.toLowerCase();
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <label
        htmlFor={id}
        className="font-body"
        style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="admin-input font-body"
          style={{
            width: "100%",
            padding: "10px 44px 10px 12px",
            fontSize: 14,
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? "Hide" : "Show"} ${name}`}
          aria-pressed={visible}
          aria-controls={id}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "hsl(var(--admin-text-soft))",
            padding: 8,
            display: "flex",
          }}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};

export default PasswordField;

interface NewPasswordFieldsProps {
  idPrefix: string;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}

export const PASSWORD_HINT =
  "At least 12 characters mixing letters, numbers and symbols, or a passphrase of 16+ characters.";

/** New + confirm password pair with a hint and a live match indicator. */
export const NewPasswordFields = ({
  idPrefix,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
}: NewPasswordFieldsProps) => {
  const hintId = `${idPrefix}-hint`;
  const matchId = `${idPrefix}-match`;
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <>
      <PasswordField
        id={`${idPrefix}-new`}
        label="New password"
        value={password}
        onChange={onPasswordChange}
        autoComplete="new-password"
        describedBy={hintId}
      />
      <p id={hintId} className="admin-help" style={{ marginTop: -8 }}>
        {PASSWORD_HINT}
      </p>
      <PasswordField
        id={`${idPrefix}-confirm`}
        label="Confirm new password"
        value={confirm}
        onChange={onConfirmChange}
        autoComplete="new-password"
        describedBy={confirm.length > 0 ? matchId : undefined}
        invalid={mismatch}
      />
      {confirm.length > 0 && (
        <p
          id={matchId}
          className="font-body"
          style={{
            fontSize: 12,
            marginTop: -8,
            color: mismatch ? "hsl(var(--admin-danger))" : "hsl(140 60% 40%)",
          }}
        >
          {mismatch ? "Passwords do not match" : "Passwords match"}
        </p>
      )}
    </>
  );
};
