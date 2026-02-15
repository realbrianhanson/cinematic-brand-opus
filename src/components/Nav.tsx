import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowRight, Menu, X } from "lucide-react";

const navLinks = [
  { label: "Story", href: "#story" },
  { label: "Expertise", href: "#expertise" },
  { label: "Speaking", href: "#speaking" },
  { label: "Results", href: "#results" },
];

const Nav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);

      // Track active section
      const sections = navLinks.map((l) => l.href.slice(1));
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
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <nav
        className="fixed top-0 left-0 w-full transition-all duration-500 ease-out"
        style={{
          zIndex: 50,
          height: scrolled ? 64 : 80,
          background: scrolled ? "rgba(7,7,14,0.82)" : "transparent",
          backdropFilter: scrolled ? "blur(30px) saturate(180%)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(30px) saturate(180%)" : "none",
          borderBottom: `1px solid ${scrolled ? "rgba(212,175,85,0.06)" : "transparent"}`,
        }}
      >
        <div
          className="mx-auto flex items-center justify-between h-full px-6 lg:px-14"
          style={{ maxWidth: 1440 }}
        >
          {/* Logo */}
          <a href="#hero" className="flex items-center gap-3 group" data-hover>
            <div
              className="flex items-center justify-center transition-shadow duration-300 group-hover:shadow-[0_0_24px_rgba(212,175,85,0.25)]"
              style={{
                width: 36,
                height: 36,
                border: "1.5px solid rgba(212,175,85,0.6)",
              }}
            >
              <span
                className="font-display italic"
                style={{ fontSize: 16, color: "#D4AF55", lineHeight: 1 }}
              >
                B
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
              Brian Hanson
            </span>
          </a>

          {/* Desktop right */}
          <div className="hidden lg:flex items-center gap-8">
            <div className="flex items-center gap-7">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  data-hover
                  className="nav-link-underline relative font-body font-medium uppercase transition-colors duration-300"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: activeSection === link.href.slice(1)
                      ? "#D4AF55"
                      : "rgba(255,255,255,0.45)",
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>

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
              href="https://aiforbeginners.com"
              target="_blank"
              rel="noopener noreferrer"
              data-hover
              className="inline-flex items-center gap-1.5 font-body font-bold uppercase transition-opacity duration-300 hover:opacity-90"
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                background: "linear-gradient(135deg, #D4AF55, #B8962E)",
                color: "#07070E",
                padding: "10px 24px",
                borderRadius: 0,
              }}
            >
              Free AI Event
              <ArrowUpRight size={13} strokeWidth={2.5} />
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
            data-hover
            aria-label="Open menu"
          >
            <Menu size={24} color="rgba(255,255,255,0.7)" />
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 100, background: "#07070E" }}
        >
          {/* Close */}
          <div className="flex justify-end px-6 pt-5">
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" data-hover>
              <X size={28} color="rgba(255,255,255,0.6)" />
            </button>
          </div>

          {/* Links */}
          <div className="flex-1 flex flex-col justify-center px-8">
            {navLinks.map((link, i) => (
              <a
                key={link.label}
                href={link.href}
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
              </a>
            ))}
          </div>

          {/* Mobile CTA */}
          <div className="px-8 pb-10">
            <a
              href="https://aiforbeginners.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center font-body font-bold uppercase"
              style={{
                fontSize: 13,
                letterSpacing: "0.08em",
                background: "linear-gradient(135deg, #D4AF55, #B8962E)",
                color: "#07070E",
                padding: "16px 24px",
                animation: "mobileNavIn 0.4s ease-out 0.35s both",
              }}
            >
              Free 3-Day AI Event →
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;
