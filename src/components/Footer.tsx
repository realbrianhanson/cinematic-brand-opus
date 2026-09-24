import { MeasurementPreferencesButton } from "@/components/PublicMeasurement";
import MobileSummitBar from "@/components/MobileSummitBar";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import WidgetRenderer from "@/components/WidgetRenderer";
import { copyrightLine } from "@/config/site";
import { useSiteConfig } from "@/config/SiteConfigContext";

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
  const siteConfig = useSiteConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const { identity, footer, brand } = siteConfig;

  const legalLinks = [
    footer.privacyUrl ? { label: "Privacy", href: footer.privacyUrl } : null,
    footer.termsUrl ? { label: "Terms", href: footer.termsUrl } : null,
  ].filter((l): l is { label: string; href: string } => l !== null);

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
    (e.currentTarget.style.color = brand.accent);
  const hoverOut = (e: React.MouseEvent<HTMLElement>) =>
    (e.currentTarget.style.color = "rgba(255,255,255,0.82)");

  return (
    <footer
      className="relative py-16"
      style={{
        background: "#050508",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
        <div className="grid md:grid-cols-3 gap-12 mb-14">
          {/* Col 1 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  border: "1.5px solid rgba(var(--brand-accent-rgb),0.6)",
                }}
              >
                <span
                  className="font-display italic"
                  style={{ fontSize: 14, color: brand.accent, lineHeight: 1 }}
                >
                  {identity.logoUrl ? (
                    <img
                      src={identity.logoUrl}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    identity.logoInitials
                  )}
                </span>
              </div>
              <span
                className="font-body font-medium uppercase"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.22em",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {identity.name}
              </span>
            </div>
            {identity.tagline && (
              <p
                className="font-body"
                style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
              >
                {identity.tagline}
              </p>
            )}
          </div>

          {/* Col 2 */}
          <div>
            <h4
              className="font-body font-bold uppercase mb-5"
              style={{
                fontSize: 12,
                letterSpacing: "0.2em",
                color: brand.accent,
              }}
            >
              Navigate
            </h4>
            <div className="flex flex-col gap-3 items-start">
              {footer.hashLinks.map((l) => (
                <a
                  key={l.label}
                  href={isHome ? l.href : `/${l.href}`}
                  data-hover
                  onClick={(event) => {
                    event.preventDefault();
                    goToHash(l.href);
                  }}
                  className="font-body transition-colors duration-200"
                  style={linkStyle}
                  onMouseEnter={hoverIn}
                  onMouseLeave={hoverOut}
                >
                  {l.label}
                </a>
              ))}
              {footer.routeLinks.map((l) => (
                <Link
                  key={l.label}
                  to={l.href}
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
          {(identity.contactEmail || footer.contactNote) && (
            <div>
              <h4
                className="font-body font-bold uppercase mb-5"
                style={{
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  color: brand.accent,
                }}
              >
                Help & contact
              </h4>
              {identity.contactEmail && (
                <a
                  href={`mailto:${identity.contactEmail}`}
                  data-hover
                  className="font-body block mb-2 transition-colors duration-200"
                  style={{ fontSize: 15, color: "rgba(255,255,255,0.9)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = brand.accent)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.9)")
                  }
                >
                  {identity.contactEmail}
                </a>
              )}
              {footer.contactNote && (
                <p
                  className="font-body"
                  style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
                >
                  {footer.contactNote}
                </p>
              )}
            </div>
          )}
        </div>

        <WidgetRenderer zone="footer" />

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span
            className="font-body"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
          >
            {copyrightLine(siteConfig)}
          </span>
          <MeasurementPreferencesButton />
          {legalLinks.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6">
              {legalLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  data-hover
                  className="font-body transition-colors duration-200"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = brand.accent)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                  }
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileSummitBar />
    </footer>
  );
};

export default Footer;
