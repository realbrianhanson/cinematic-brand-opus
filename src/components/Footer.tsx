import { Link } from "react-router-dom";
import WidgetRenderer from "@/components/WidgetRenderer";
const navLinks = [
  { label: "Story", href: "#story" },
  { label: "Expertise", href: "#expertise" },
  { label: "Speaking", href: "#speaking" },
  { label: "Results", href: "#results" },
];

const Footer = () => (
  <footer className="relative py-16" style={{ background: "#050508", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
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
            <span className="font-body font-medium uppercase" style={{ fontSize: 11, letterSpacing: "0.25em", color: "rgba(255,255,255,0.5)" }}>
              Brian Hanson
            </span>
          </div>
          <p className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            AI · Marketing · Business Growth
          </p>
        </div>

        {/* Col 2 */}
        <div>
          <h4 className="font-body font-bold uppercase mb-5" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(212,175,85,0.6)" }}>
            Navigate
          </h4>
          <div className="flex flex-col gap-3">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                data-hover
                className="font-body transition-colors duration-200"
                style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/blog"
              data-hover
              className="font-body transition-colors duration-200"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              Blog
            </Link>
            <Link
              to="/resources"
              data-hover
              className="font-body transition-colors duration-200"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              Resources
            </Link>
            <Link
              to="/sitemap"
              data-hover
              className="font-body transition-colors duration-200"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
            >
              Sitemap
            </Link>
          </div>
        </div>

        {/* Col 3 */}
        <div>
          <h4 className="font-body font-bold uppercase mb-5" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(212,175,85,0.6)" }}>
            Contact
          </h4>
          <a
            href="mailto:hello@brianhanson.com"
            data-hover
            className="font-body block mb-2 transition-colors duration-200"
            style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          >
            hello@brianhanson.com
          </a>
          <p className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            Speaking · Partnerships · Media
          </p>
        </div>
      </div>

      <WidgetRenderer zone="footer" />

      {/* Bottom bar */}
      <div
        className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          © 2026 Brian Hanson. All rights reserved.
        </span>
        <div className="flex gap-6">
          {["Privacy", "Terms"].map((t) => (
            <a
              key={t}
              href="#"
              data-hover
              className="font-body transition-colors duration-200"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
            >
              {t}
            </a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
