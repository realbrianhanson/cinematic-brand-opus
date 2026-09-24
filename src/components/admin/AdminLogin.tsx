import { useSiteConfig } from "@/config/SiteConfigContext";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import ForgotPasswordForm from "./ForgotPasswordForm";

const AdminLogin = () => {
  const siteConfig = useSiteConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const {
    signIn,
    signOut,
    user,
    isAdmin,
    roleError,
    roleRechecking,
    recheckRole,
    loading: authLoading,
  } = useAuth();
  const navigate = useNavigate();

  // Redirecting is a side effect, never something done during render.
  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [authLoading, user, isAdmin, navigate]);

  const signedIn = !authLoading && !!user && !isAdmin;
  // A failed lookup is not a "no": only a definite answer gets that message.
  const accessCheckFailed = signedIn && roleError;
  const signedInWithoutAccess = signedIn && !roleError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
      // Signing in again as the same user must re-run the role lookup.
      else recheckRole();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign in failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="admin-shell min-h-screen flex items-center justify-center"
      style={{ padding: 28 }}
    >
      <div
        className="admin-card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "56px 44px",
        }}
      >
        <div className="text-center" style={{ marginBottom: 40 }}>
          <div
            className="mx-auto flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              border: "1.5px solid hsl(var(--admin-accent) / 0.6)",
              borderRadius: 6,
              marginBottom: 20,
            }}
          >
            <span
              className="font-heading italic"
              style={{
                fontSize: 22,
                color: "hsl(var(--admin-accent))",
                lineHeight: 1,
              }}
            >
              {siteConfig.identity.logoInitials}
            </span>
          </div>
          <span
            className="font-heading italic block"
            style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}
          >
            {siteConfig.identity.name}
          </span>
          <div
            className="mx-auto"
            style={{
              width: 30,
              height: 1,
              background: "hsl(var(--admin-accent) / 0.3)",
              margin: "16px auto",
            }}
          />
          <span
            className="font-body block"
            style={{
              fontSize: 12,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "hsl(var(--admin-text-ghost))",
            }}
          >
            Admin Portal
          </span>
        </div>

        {mode === "forgot" ? (
          <ForgotPasswordForm
            initialEmail={email}
            onBack={() => setMode("signin")}
          />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col"
            style={{ gap: 14 }}
          >
            <label htmlFor="admin-email" className="sr-only">
              Email
            </label>
            <input
              id="admin-email"
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
            <label htmlFor="admin-password" className="sr-only">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="admin-password"
                name="password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="admin-input font-body"
                style={{
                  padding: "14px 40px 14px 18px",
                  fontSize: 14,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Hide password" : "Show password"}
                aria-pressed={showPass}
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--admin-text-soft))",
                  padding: 0,
                  display: "flex",
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error ? (
              <p
                role="alert"
                className="font-body text-center"
                style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
              >
                {error}
              </p>
            ) : accessCheckFailed ? (
              <div
                role="alert"
                className="font-body text-center"
                style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
              >
                <p>
                  Couldn't verify admin access right now. This is usually a
                  temporary connection problem.
                </p>
                <button
                  type="button"
                  onClick={recheckRole}
                  disabled={roleRechecking}
                  className="admin-btn-secondary"
                  style={{ marginTop: 10 }}
                >
                  {roleRechecking ? "Checking…" : "Retry"}
                </button>
              </div>
            ) : signedInWithoutAccess ? (
              <div
                role="alert"
                className="font-body text-center"
                style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
              >
                <p>
                  This account does not have admin access. Sign in with an admin
                  account.
                </p>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="admin-btn-ghost"
                  style={{ marginTop: 8, fontSize: 13 }}
                >
                  Sign out and use a different account
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={pending || authLoading}
              className="admin-btn-primary justify-center"
              style={{ padding: "16px", marginTop: 4 }}
            >
              {pending ? "Signing in..." : "Sign In"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode("forgot");
              }}
              className="admin-btn-ghost justify-center font-body"
              style={{ fontSize: 13 }}
            >
              Forgot password?
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
