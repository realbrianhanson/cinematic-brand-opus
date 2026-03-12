import { useState } from "react";

const SidebarNewsletter = ({ config }: { config: any }) => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      <h3 className="font-display italic mb-2" style={{ fontSize: 20, color: "hsl(var(--foreground))" }}>
        {config.title || "Stay Updated"}
      </h3>
      <p className="font-body mb-4" style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
        {config.description || "Get the latest tips delivered to your inbox."}
      </p>
      {submitted ? (
        <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--accent))" }}>Thanks for subscribing!</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="font-body"
            style={{ padding: "8px 12px", fontSize: 13, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
          <button
            type="submit"
            className="font-body uppercase"
            style={{ padding: "10px", fontSize: 11, letterSpacing: "0.1em", background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            Subscribe
          </button>
        </form>
      )}
    </div>
  );
};

export default SidebarNewsletter;
