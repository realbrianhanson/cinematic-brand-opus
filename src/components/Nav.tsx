import { useState, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, ArrowRight, Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { useSiteConfig } from "@/config/SiteConfigContext";

interface NavProps {
  loaded?: boolean;
}

const Nav = ({ loaded = true }: NavProps) => {
  const siteConfig = useSiteConfig();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const { identity, nav, brand } = siteConfig;
  const navLinks = [...nav.hashLinks, ...nav.routeLinks];

  const handleHashClick = (e: React.MouseEvent, hash: string) => {
    e.preventDefault();
    setMenuOpen(false);
    const id = hash.replace("#", "");
    if (isHome) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    if (isHome) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      history.replaceState(null, "", "/");
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);

      // Track active section
      const sections = nav.hashLinks.map((l) => l.href.slice(1));
      let current = "";
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [nav.hashLinks]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      {/* Keyboard users can jump straight past the fixed header. */}
      <a
        href="#main-content"
        className="skip-to-content font-body font-bold uppercase"
        style={{ letterSpacing: "0.08em" }}
      >
        Skip to content
      </a>
      <nav
        className="fixed top-0 left-0 w-full transition-all duration-500 ease-out"
        style={{
          zIndex: 50,
          height: scrolled ? 64 : 80,
          background: scrolled
            ? "rgba(var(--brand-backdrop-rgb),0.82)"
            : "transparent",
          backdropFilter: scrolled ? "blur(30px) saturate(180%)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(30px) saturate(180%)" : "none",
          borderBottom: `1px solid ${scrolled ? "rgba(var(--brand-accent-rgb),0.06)" : "transparent"}`,
          opacity: loaded ? 1 : 0,
          transform: loaded ? "translateY(0)" : "translateY(-20px)",
          transition: "all 0.5s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          className="mx-auto flex items-center justify-between h-full px-6 lg:px-14"
          style={{ maxWidth: 1440 }}
        >
          {/* Logo */}
          <a
            href="/"
            onClick={handleLogoClick}
            className="flex items-center gap-3 group"
            data-hover
          >
            <div
              className="flex items-center justify-center transition-shadow duration-300 group-hover:shadow-[0_0_24px_rgba(var(--brand-accent-rgb),0.25)]"
              style={{
                width: 36,
                height: 36,
                border: "1.5px solid rgba(var(--brand-accent-rgb),0.6)",
              }}
            >
              <span
                className="font-display italic"
                style={{ fontSize: 16, color: brand.accent, lineHeight: 1 }}
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
              className="hidden lg:block font-body font-medium uppercase"
              style={{
                fontSize: 11,
                letterSpacing: "0.25em",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {identity.name}
            </span>
          </a>

          {/* Desktop right */}
          <div className="hidden lg:flex items-center gap-8">
            <div className="flex items-center gap-7">
              {navLinks.map((link) =>
                link.href.startsWith("/") ? (
                  <Link
                    key={link.label}
                    to={link.href}
                    data-hover
                    className="nav-link-underline relative font-body font-medium uppercase transition-colors duration-300"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: "rgba(255,255,255,0.45)",
                    }}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={isHome ? link.href : `/${link.href}`}
                    onClick={(e) => handleHashClick(e, link.href)}
                    data-hover
                    className="nav-link-underline relative font-body font-medium uppercase transition-colors duration-300"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color:
                        activeSection === link.href.slice(1)
                          ? brand.accent
                          : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {link.label}
                  </a>
                ),
              )}
            </div>

            {nav.cta && (
              <>
                {/* Divider */}
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: "rgba(255,255,255,0.1)",
                  }}
                />

                {/* CTA */}
                <a
                  href={nav.cta.href}
                  target={nav.cta.external ? "_blank" : undefined}
                  rel={nav.cta.external ? "noopener noreferrer" : undefined}
                  data-hover
                  className="inline-flex items-center gap-1.5 font-body font-bold uppercase transition-opacity duration-300 hover:opacity-90"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    background: `linear-gradient(135deg, ${brand.accent}, ${brand.accentDark})`,
                    color: brand.backdrop,
                    padding: "10px 24px",
                    borderRadius: 0,
                  }}
                >
                  {nav.cta.label}
                  <ArrowUpRight size={13} strokeWidth={2.5} />
                </a>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            ref={menuTrigger}
            type="button"
            className="lg:hidden inline-flex items-center justify-center"
            onClick={() => setMenuOpen(true)}
            data-hover
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-site-menu"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Menu size={24} color="rgba(255,255,255,0.7)" />
          </button>
        </div>
      </nav>

      {/* Mobile menu: a real dialog, so focus is trapped, Escape closes it and
          focus returns to the hamburger on close. */}
      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuTrigger.current?.focus();
            }}
            aria-describedby={undefined}
            aria-label="Site menu"
            id="mobile-site-menu"
            className="fixed inset-0 flex flex-col overflow-y-auto focus:outline-none"
            style={{ zIndex: 100, background: brand.backdrop }}
          >
            <DialogPrimitive.Title className="sr-only">
              Site menu
            </DialogPrimitive.Title>
            {/* Close */}
            <div className="flex justify-end px-6 pt-5">
              <DialogPrimitive.Close
                aria-label="Close menu"
                data-hover
                className="inline-flex items-center justify-center"
                style={{ minWidth: 44, minHeight: 44 }}
              >
                <X size={28} color="rgba(255,255,255,0.6)" />
              </DialogPrimitive.Close>
            </div>

            {/* Links */}
            <div className="flex-1 flex flex-col justify-center px-8">
              {navLinks.map((link, i) =>
                link.href.startsWith("/") ? (
                  <Link
                    key={link.label}
                    to={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between py-5 font-display italic text-foreground"
                    style={{
                      fontSize: "clamp(2rem, 6vw, 2.8rem)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      animation: `mobileNavIn 0.4s ease-out ${i * 0.07}s both`,
                    }}
                  >
                    {link.label}
                    <ArrowRight size={22} color="rgba(255,255,255,0.25)" />
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={isHome ? link.href : `/${link.href}`}
                    onClick={(e) => handleHashClick(e, link.href)}
                    className="flex items-center justify-between py-5 font-display italic text-foreground"
                    style={{
                      fontSize: "clamp(2rem, 6vw, 2.8rem)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      animation: `mobileNavIn 0.4s ease-out ${i * 0.07}s both`,
                    }}
                  >
                    {link.label}
                    <ArrowRight size={22} color="rgba(255,255,255,0.25)" />
                  </a>
                ),
              )}
            </div>

            {/* Mobile CTA */}
            {nav.cta && (
              <div className="px-8 pb-10">
                <a
                  href={nav.cta.href}
                  target={nav.cta.external ? "_blank" : undefined}
                  rel={nav.cta.external ? "noopener noreferrer" : undefined}
                  className="block w-full text-center font-body font-bold uppercase"
                  style={{
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    background: `linear-gradient(135deg, ${brand.accent}, ${brand.accentDark})`,
                    color: brand.backdrop,
                    padding: "16px 24px",
                    animation: "mobileNavIn 0.4s ease-out 0.35s both",
                  }}
                >
                  {nav.mobileCtaLabel ?? nav.cta.label}
                </a>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
};

export default Nav;
