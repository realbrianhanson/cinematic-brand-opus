import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  describePasswordUpdateError,
  passwordProblems,
} from "@/lib/passwordPolicy";
import PasswordField, { NewPasswordFields } from "./PasswordField";

type Outcome = { kind: "error"; messages: string[] } | { kind: "success" };

function describeReauthError(error: { status?: number; code?: string }) {
  if (error.status === 429 || error.code === "over_request_rate_limit")
    return "Too many attempts. Wait a few minutes and try again.";
  if (error.status === 400 || error.code === "invalid_credentials")
    return "Current password is incorrect.";
  return "Couldn't confirm your current password. Try again.";
}

/**
 * Changes the signed-in admin's password. The current password is verified
 * first by signing in again with it, so an unattended session alone cannot
 * change the password from this screen.
 */
const ChangePassword = () => {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const fail = (...messages: string[]) =>
    setOutcome({ kind: "error", messages });

  const validate = (): string[] => {
    if (!email) return ["Your session expired. Sign in again."];
    if (!current) return ["Enter your current password."];
    const problems = passwordProblems(next, { email, current });
    if (next !== confirm) problems.push("New passwords don't match.");
    return problems;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOutcome(null);
    const problems = validate();
    if (problems.length) return fail(...problems);
    setPending(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauthError) return fail(describeReauthError(reauthError));
      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
      });
      if (updateError) return fail(describePasswordUpdateError(updateError));
      setCurrent("");
      setNext("");
      setConfirm("");
      setOutcome({ kind: "success" });
      toast({ title: "Password updated" });
    } catch (err) {
      console.error("Password update error:", err);
      fail("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="change-password-title"
      className="flex flex-col"
      style={{ gap: 16, maxWidth: 420 }}
      noValidate
    >
      <h2 id="change-password-title">Change password</h2>
      {/* Lets password managers attach the new password to this account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <PasswordField
        id="current-password"
        label="Current password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <NewPasswordFields
        idPrefix="change-password"
        password={next}
        confirm={confirm}
        onPasswordChange={setNext}
        onConfirmChange={setConfirm}
      />
      {outcome?.kind === "error" && (
        <div role="alert" className="admin-notice admin-notice-error">
          {outcome.messages.length === 1 ? (
            <p>{outcome.messages[0]}</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
              {outcome.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {outcome?.kind === "success" && (
        <p role="status" className="admin-notice">
          Password updated.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary justify-center"
        style={{ alignSelf: "flex-start" }}
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
};

export default ChangePassword;
