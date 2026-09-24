import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const NEUTRAL_MESSAGE =
  "If an admin account exists for that email, a reset link is on its way. Check your inbox and spam folder; the link expires in about an hour.";
const CONNECTION_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";

function resetPasswordRedirectUrl(origin: string): string {
  return `${origin}/admin/reset-password`;
}

function isConnectionFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  return name === "AuthRetryableFetchError" || status === 0;
}

interface ForgotPasswordFormProps {
  initialEmail: string;
  onBack: () => void;
}

/**
 * Requests a password-recovery email. The response never reveals whether an
 * account exists: every provider answer maps to the same neutral message.
 */
const ForgotPasswordForm = ({
  initialEmail,
  onBack,
}: ForgotPasswordFormProps) => {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSent(false);
    setPending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: resetPasswordRedirectUrl(window.location.origin) },
      );
      if (isConnectionFailure(resetError)) setError(CONNECTION_MESSAGE);
      else setSent(true);
    } catch {
      setError(CONNECTION_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col"
      style={{ gap: 14 }}
      aria-labelledby="forgot-password-title"
    >
      <h1
        id="forgot-password-title"
        className="font-heading text-center"
        style={{ fontSize: 18, color: "hsl(var(--admin-text))" }}
      >
        Reset your password
      </h1>
      <p className="admin-help text-center">
        Enter your admin email and we'll send a link to choose a new password.
      </p>
      <label htmlFor="admin-reset-email" className="sr-only">
        Email
      </label>
      <input
        id="admin-reset-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="admin-input font-body"
        style={{ padding: "14px 18px", fontSize: 14 }}
      />
      {sent && (
        <p
          role="status"
          className="font-body text-center"
          style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}
        >
          {NEUTRAL_MESSAGE}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="font-body text-center"
          style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary justify-center"
        style={{ padding: "16px", marginTop: 4 }}
      >
        {pending ? "Sending..." : "Send reset link"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="admin-btn-ghost justify-center font-body"
        style={{ fontSize: 13 }}
      >
        Back to sign in
      </button>
    </form>
  );
};

export default ForgotPasswordForm;
