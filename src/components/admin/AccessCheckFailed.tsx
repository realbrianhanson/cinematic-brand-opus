import { useAuth } from "@/contexts/AuthContext";

/**
 * Shown when the admin role lookup failed (network, timeout, server error).
 * Access stays closed; this only replaces the misleading "no admin access"
 * redirect with a way to try again.
 */
const AccessCheckFailed = () => {
  const { user, roleRechecking, recheckRole, signOut } = useAuth();
  return (
    <div
      className="admin-shell min-h-screen flex items-center justify-center"
      style={{ padding: 28 }}
    >
      <div
        className="admin-card"
        role="alert"
        style={{ maxWidth: 440, width: "100%", padding: "40px 36px" }}
      >
        <h1
          className="font-heading"
          style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}
        >
          We couldn't verify your admin access
        </h1>
        <p className="admin-help" style={{ marginTop: 12 }}>
          This is usually a temporary connection problem, not a change to your
          account.
          {user?.email ? ` You're signed in as ${user.email}.` : ""}
        </p>
        <div className="flex flex-wrap" style={{ gap: 12, marginTop: 24 }}>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={recheckRole}
            disabled={roleRechecking}
          >
            {roleRechecking ? "Checking…" : "Retry"}
          </button>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessCheckFailed;
