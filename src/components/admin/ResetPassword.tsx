import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { initialRecoveryHint } from "@/lib/authRecovery";
import {
  describePasswordUpdateError,
  passwordProblems,
} from "@/lib/passwordPolicy";
import { Link, useNavigate } from "@/lib/router-compat";
import { NewPasswordFields } from "./PasswordField";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div
    className="admin-shell min-h-screen flex items-center justify-center"
    style={{ padding: 28 }}
  >
    <div
      className="admin-card flex flex-col"
      style={{ maxWidth: 440, width: "100%", padding: "44px 36px", gap: 16 }}
    >
      {children}
    </div>
  </div>
);

const Title = ({ children }: { children: React.ReactNode }) => (
  <h1
    className="font-heading"
    style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}
  >
    {children}
  </h1>
);

/**
 * Landing page for the password-recovery email. Only a session that came
 * from a recovery link may set a password here; everything else is sent back
 * to request a fresh link.
 */
const ResetPassword = () => {
  const { user, loading, passwordRecovery, endPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  if (loading && initialRecoveryHint.kind !== "error") {
    return (
      <Shell>
        <p role="status" className="admin-help">
          Checking your reset link…
        </p>
      </Shell>
    );
  }

  if (initialRecoveryHint.kind === "error" || !user || !passwordRecovery) {
    return (
      <Shell>
        <Title>Reset link expired</Title>
        <p className="admin-help">
          This password reset link is invalid, already used, or has expired.
          Reset links work once and only for a limited time.
        </p>
        <Link to="/admin/login" className="admin-btn-primary justify-center">
          Request a new link
        </Link>
      </Shell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems = passwordProblems(password, { email: user.email });
    if (password !== confirm) problems.push("New passwords don't match.");
    setErrors(problems);
    if (problems.length) return;
    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrors([describePasswordUpdateError(error)]);
        return;
      }
      endPasswordRecovery();
      toast({ title: "Password updated" });
      navigate("/admin", { replace: true });
    } catch (err) {
      console.error("Password reset error:", err);
      setErrors([
        "Couldn't reach the server. Check your connection and try again.",
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <Shell>
      <Title>Choose a new password</Title>
      <p className="admin-help">Setting a new password for {user.email}.</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ gap: 16 }}
        noValidate
      >
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={user.email ?? ""}
          readOnly
          hidden
        />
        <NewPasswordFields
          idPrefix="reset-password"
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />
        {errors.length > 0 && (
          <div role="alert" className="admin-notice admin-notice-error">
            <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="admin-btn-primary justify-center"
        >
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    </Shell>
  );
};

export default ResetPassword;
