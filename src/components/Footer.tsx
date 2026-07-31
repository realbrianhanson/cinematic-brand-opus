import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import WidgetRenderer from "@/components/WidgetRenderer";

const hashLinks = [
  { label: "Story", hash: "#story" },
  { label: "Expertise", hash: "#expertise" },
  { label: "Speaking", hash: "#speaking" },
  { label: "Results", hash: "#results" },
];

const routeLinks = [
  { label: "Blog", to: "/blog" },
  { label: "News", to: "/news" },
  { label: "Resources", to: "/resources" },
  { label: "Sitemap", to: "/sitemap" },
];

const linkStyle: React.CSSProperties = {
  fontSize: 15,
  color: "rgba(255,255,255,0.82)",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

const Footer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const goToHash = (hash: string) => {
    const id = hash.replace("#", "");
    if (isHome) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  };

  const hoverIn = (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget.style.color = "#D4AF55");
  const hoverOut = (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget.style.color = "rgba(255,255,255,0.82)");

  return (
    <footer className="relative py-16" style={{ background: "#050508", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
        <div className="grid md:grid-cols-3 gap-12 mb-14">
          {/* Col 1 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center"
                style={{ width: 32, height: 32, border: "1.5px solid rgba(212,175,85,0.6)" }}
              >
                <span className="font-display italic" style={{ fontSize: 14, color: "#D4AF55", lineHeight: 1 }}>B</span>
              </div>
              <span className="font-body font-medium uppercase" style={{ fontSize: 12, letterSpacing: "0.22em", color: "rgba(255,255,255,0.85)" }}>
                Brian Hanson
              </span>
            </div>
            <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              AI · Marketing · Business Growth
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <h4 className="font-body font-bold uppercase mb-5" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#D4AF55" }}>
              Navigate
            </h4>
            <div className="flex flex-col gap-3 items-start">
              {hashLinks.map((l) => (
                <button
                  key={l.label}
                  type="button"
                  data-hover
                  onClick={() => goToHash(l.hash)}
                  className="font-body transition-colors duration-200"
                  style={linkStyle}
                  onMouseEnter={hoverIn}
                  onMouseLeave={hoverOut}
                >
                  {l.label}
                </button>
              ))}
              {routeLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.to}
                  data-hover
                  className="font-body transition-colors duration-200"
                  style={linkStyle}
                  onMouseEnter={hoverIn}
                  onMouseLeave={hoverOut}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Col 3 */}
          <div>
            <h4 className="font-body font-bold uppercase mb-5" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#D4AF55" }}>
              Contact
            </h4>
            <a
              href="mailto:hello@brianhanson.com"
              data-hover
              className="font-body block mb-2 transition-colors duration-200"
              style={{ fontSize: 15, color: "rgba(255,255,255,0.9)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
            >
              hello@brianhanson.com
            </a>
            <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              Speaking · Partnerships · Media
            </p>
          </div>
        </div>

        <WidgetRenderer zone="footer" />

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="font-body" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            © 2026 Brian Hanson. All rights reserved.
          </span>
          <div className="flex gap-6">
            {["Privacy", "Terms"].map((t) => (
              <a
                key={t}
                href="#"
                data-hover
                className="font-body transition-colors duration-200"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
