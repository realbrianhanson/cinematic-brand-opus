import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Check, X } from "lucide-react";

const ChangePassword = () => {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordsMatch = newPass.length > 0 && confirmPass.length > 0 && newPass === confirmPass;
  const passwordsMismatch = confirmPass.length > 0 && newPass !== confirmPass;

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

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (sessionError || !accessToken) {
        toast({ title: "Your session expired. Please sign in again.", variant: "destructive" });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPass }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const backendMessage =
          payload?.msg || payload?.error_description || payload?.error || "Unable to update password";

        toast({
          title:
            backendMessage === "New password should be different from the old password."
              ? "Please choose a different password from your current one"
              : backendMessage,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Password updated successfully" });
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      console.error("Password update error:", err);
      toast({ title: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
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
          <div style={{ position: "relative" }}>
            <input
              type={showNew ? "text" : "password"}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              required
              minLength={8}
              className="font-body"
              style={{
                width: "100%",
                padding: "10px 40px 10px 12px",
                fontSize: 14,
                borderRadius: 6,
                border: "1px solid hsl(var(--admin-border))",
                backgroundColor: "hsl(var(--admin-surface))",
                color: "hsl(var(--admin-text))",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              style={{
                position: "absolute",
                right: 10,
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
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
            Confirm Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              required
              minLength={8}
              className="font-body"
              style={{
                width: "100%",
                padding: "10px 40px 10px 12px",
                fontSize: 14,
                borderRadius: 6,
                border: `1px solid ${passwordsMismatch ? "hsl(0 70% 50%)" : passwordsMatch ? "hsl(140 60% 40%)" : "hsl(var(--admin-border))"}`,
                backgroundColor: "hsl(var(--admin-surface))",
                color: "hsl(var(--admin-text))",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={{
                position: "absolute",
                right: 10,
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
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPass.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, marginTop: 2 }}>
              {passwordsMatch ? (
                <>
                  <Check size={14} style={{ color: "hsl(140 60% 40%)" }} />
                  <span className="font-body" style={{ color: "hsl(140 60% 40%)" }}>Passwords match</span>
                </>
              ) : (
                <>
                  <X size={14} style={{ color: "hsl(0 70% 50%)" }} />
                  <span className="font-body" style={{ color: "hsl(0 70% 50%)" }}>Passwords do not match</span>
                </>
              )}
            </div>
          )}
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
