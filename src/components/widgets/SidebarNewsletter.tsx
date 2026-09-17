import type { WidgetConfig, WidgetPageContext } from "@/lib/widgetConfig";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  interpretSubscribeResult,
  type SubscribeUiState,
} from "@/lib/newsletterClient";

const SidebarNewsletter = ({ config }: { config: WidgetConfig }) => {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubscribeUiState>("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    setMessage("");

    let status = 200;
    let payload: unknown = null;
    try {
      const { data, error } = await supabase.functions.invoke(
        "newsletter-subscribe",
        {
          body: { email, source: "sidebar" },
        },
      );
      if (error) {
        const res = error?.context as Response | undefined;
        if (res) {
          status = res.status;
          payload = await res
            .clone()
            .json()
            .catch(() => null);
        } else {
          status = 0;
        }
      } else {
        payload = data;
      }
    } catch {
      status = 0;
    }

    const result = interpretSubscribeResult(status, payload);
    setState(result.state);
    setMessage(result.message);
    if (result.state === "confirmation_sent") setEmail("");
  };

  const isDone =
    state === "confirmation_sent" ||
    state === "already_subscribed" ||
    state === "already_requested";

  const tone =
    state === "unavailable" || state === "rate_limited" || state === "error"
      ? "#ff6b6b"
      : "hsl(var(--accent))";

  return (
    <div
      style={{
        padding: 24,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <h3
        className="font-display italic mb-2"
        style={{ fontSize: 20, color: "hsl(var(--foreground))" }}
      >
        {config.title || "Stay Updated"}
      </h3>
      <p
        className="font-body mb-4"
        style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}
      >
        {config.description || "Get the latest tips delivered to your inbox."}
      </p>
      {isDone ? (
        <p
          className="font-body"
          style={{ fontSize: 13, color: tone }}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="sidebar-newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="sidebar-newsletter-email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            className="font-body"
            style={{
              padding: "8px 12px",
              fontSize: 13,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="font-body uppercase"
            style={{
              padding: "10px",
              fontSize: 11,
              letterSpacing: "0.1em",
              background: "hsl(var(--accent))",
              color: "hsl(var(--accent-foreground))",
              border: "none",
              cursor: state === "loading" ? "wait" : "pointer",
              fontWeight: 600,
              opacity: state === "loading" ? 0.7 : 1,
            }}
          >
            {state === "loading" ? "Subscribing…" : "Subscribe"}
          </button>
          {message && (
            <p
              className="font-body"
              style={{ fontSize: 12, color: tone }}
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
};

export default SidebarNewsletter;
