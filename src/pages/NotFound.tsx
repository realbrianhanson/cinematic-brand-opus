import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import Nav from "@/components/Nav";
import PageHead from "@/components/PageHead";

const NotFound = () => {
  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <PageHead title="Page Not Found" description="The page you're looking for doesn't exist." url="/404" />
      <Nav />
      <main className="flex flex-col items-center justify-center px-6 pt-40 pb-24 text-center" style={{ minHeight: "80vh" }}>
        <p className="font-body uppercase mb-4" style={{ fontSize: 12, letterSpacing: "0.2em", color: "hsl(var(--accent))" }}>
          404
        </p>
        <h1 className="font-display italic mb-4" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.15 }}>
          Page Not Found
        </h1>
        <p className="font-body mb-10" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 420, lineHeight: 1.6 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <nav className="flex flex-col sm:flex-row gap-4" aria-label="Helpful links">
          <Link
            to="/resources"
            className="font-body uppercase inline-flex items-center gap-2 px-6 py-3 transition-all"
            style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 600, background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))", textDecoration: "none" }}
          >
            Browse Resources <ArrowRight size={14} />
          </Link>
          <Link
            to="/blog"
            className="font-body uppercase inline-flex items-center gap-2 px-6 py-3 transition-all"
            style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 500, border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
          >
            Read the Blog <ArrowRight size={14} />
          </Link>
          <Link
            to="/"
            className="font-body uppercase inline-flex items-center gap-2 px-6 py-3 transition-all"
            style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 500, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}
          >
            Go Home
          </Link>
        </nav>
      </main>
    </div>
  );
};

export default NotFound;
