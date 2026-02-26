import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, user, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (user && isAdmin) {
    navigate("/admin", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate("/admin");
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
              C
            </span>
          </div>
          <span
            className="font-heading italic block"
            style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}
          >
            Courtney Hanson
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

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 14 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="admin-input font-body"
            style={{ padding: "14px 18px", fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="admin-input font-body"
            style={{ padding: "14px 18px", fontSize: 14 }}
          />

          {error && (
            <p
              className="font-body text-center"
              style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="admin-btn-primary justify-center"
            style={{ padding: "16px", marginTop: 4 }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
