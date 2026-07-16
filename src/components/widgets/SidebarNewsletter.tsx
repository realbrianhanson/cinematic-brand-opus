import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SidebarNewsletter = ({ config }: { config: any }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-subscribe", {
        body: { email, source: "sidebar" },
      });
      if (error) throw error;
      const state = (data as any)?.state;
      if (state === "confirmation_sent" || state === "pending_email_setup") {
        setStatus("success");
        setMessage("Check your inbox to confirm!");
      } else if (state === "already_subscribed") {
        setStatus("success");
        setMessage("You're already on the list.");
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <div style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      <h3 className="font-display italic mb-2" style={{ fontSize: 20, color: "hsl(var(--foreground))" }}>
        {config.title || "Stay Updated"}
      </h3>
      <p className="font-body mb-4" style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
        {config.description || "Get the latest tips delivered to your inbox."}
      </p>
      {status === "success" ? (
        <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--accent))" }}>{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            className="font-body"
            style={{ padding: "8px 12px", fontSize: 13, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="font-body uppercase"
            style={{ padding: "10px", fontSize: 11, letterSpacing: "0.1em", background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))", border: "none", cursor: status === "loading" ? "wait" : "pointer", fontWeight: 600, opacity: status === "loading" ? 0.7 : 1 }}
          >
            {status === "loading" ? "Subscribing…" : "Subscribe"}
          </button>
          {status === "error" && (
            <p className="font-body" style={{ fontSize: 12, color: "#ff6b6b" }}>{message}</p>
          )}
        </form>
      )}
    </div>
  );
};

export default SidebarNewsletter;
