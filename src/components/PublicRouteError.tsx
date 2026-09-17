import { useRouter } from "@tanstack/react-router";
import { Link } from "@/lib/router-compat";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

/**
 * Retryable error state for public content routes.
 *
 * A failed read is NOT the same as missing content: this never says "not found"
 * and never renders an empty list, it offers a retry that re-runs the loader.
 */
const PublicRouteError = ({ message }: { message?: string }) => {
  const router = useRouter();

  return (
    <div className="public-site min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <Nav />
      <main
        id="main-content"
        className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-6 text-center"
      >
        <h1 className="font-display italic" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
          This page could not load
        </h1>
        <p className="font-body" style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", maxWidth: 520 }}>
          {message ?? "Something went wrong while fetching this content. Your connection may have dropped."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => router.invalidate()}
            className="font-body font-bold uppercase"
            style={{
              fontSize: 13,
              letterSpacing: "0.08em",
              border: "1.5px solid #D4AF55",
              color: "#fff",
              background: "transparent",
              padding: "14px 28px",
              minHeight: 44,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            to="/"
            className="font-body uppercase"
            style={{ fontSize: 12, letterSpacing: "0.15em", color: "#D4AF55", minHeight: 44, display: "inline-flex", alignItems: "center" }}
          >
            Back to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PublicRouteError;
