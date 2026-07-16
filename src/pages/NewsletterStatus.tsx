import { Link, useLocation } from "react-router-dom";

const MESSAGES: Record<string, { headline: string; line: string }> = {
  "/newsletter/confirmed": {
    headline: "You're in.",
    line: "Talk soon.",
  },
  "/newsletter/unsubscribed": {
    headline: "You're unsubscribed.",
    line: "No hard feelings.",
  },
  "/newsletter/invalid": {
    headline: "That link didn't work.",
    line: "Try subscribing again.",
  },
};

const NewsletterStatus = () => {
  const { pathname } = useLocation();
  const msg = MESSAGES[pathname] ?? MESSAGES["/newsletter/invalid"];

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#07070E" }}
    >
      <div className="text-center max-w-md">
        <h1
          className="font-display mb-4"
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            lineHeight: 1.1,
            color: "#fff",
          }}
        >
          {msg.headline}
        </h1>
        <p
          className="font-body mb-10"
          style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.75)" }}
        >
          {msg.line}
        </p>
        <Link
          to="/"
          className="inline-block font-body font-bold uppercase transition-opacity hover:opacity-90"
          style={{
            fontSize: 13,
            letterSpacing: "0.08em",
            padding: "14px 32px",
            background: "linear-gradient(135deg, #D4AF55, #B8962E)",
            color: "#07070E",
          }}
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
};

export default NewsletterStatus;
