import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const ChangePassword = () => {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (newPass !== confirmPass) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);

    // Safety timeout - reset loading after 10s no matter what
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) {
        setLoading(false);
        toast({ title: "Request timed out. Please try again.", variant: "destructive" });
      }
    }, 10000);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      clearTimeout(safetyTimer);
      if (!mountedRef.current) return;
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Password updated successfully" });
        setNewPass("");
        setConfirmPass("");
      }
    } catch (err) {
      clearTimeout(safetyTimer);
      if (!mountedRef.current) return;
      console.error("Password update error:", err);
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      clearTimeout(safetyTimer);
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 24 }}
      >
        Change Password
      </h2>
      <form onSubmit={handleSubmit} style={{ maxWidth: 400, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
            New Password
          </label>
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            required
            minLength={8}
            className="font-body"
            style={{
              padding: "10px 12px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid hsl(var(--admin-border))",
              backgroundColor: "hsl(var(--admin-surface))",
              color: "hsl(var(--admin-text))",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            required
            minLength={8}
            className="font-body"
            style={{
              padding: "10px 12px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid hsl(var(--admin-border))",
              backgroundColor: "hsl(var(--admin-surface))",
              color: "hsl(var(--admin-text))",
              outline: "none",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="font-body"
          style={{
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: "none",
            backgroundColor: "hsl(var(--admin-accent))",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </div>
  );
};

export default ChangePassword;
