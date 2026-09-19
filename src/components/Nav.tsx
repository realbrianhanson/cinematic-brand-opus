import { useState, useEffect, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { useSiteConfig } from "@/config/SiteConfigContext";
import type { LinkItem, NavGroup, NavItem } from "@/config/types";

interface NavProps {
  loaded?: boolean;
}

const currentRoute = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

/** Native disclosure keeps resource links usable even before hydration. */
function ResourceNavigation({
  group,
  mobile,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  mobile: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  const detail = useRef<HTMLDetailsElement>(null);
  const active = group.children.some((link) =>
    currentRoute(pathname, link.href),
  );
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !detail.current?.contains(event.target) &&
        detail.current
      )
        detail.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details
      ref={detail}
      className={mobile ? "group border-b border-white/10" : "group relative"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && detail.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          detail.current.open = false;
          detail.current.querySelector("summary")?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary
        className={`list-none cursor-pointer flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)] ${mobile ? "py-4 font-display italic text-[clamp(1.8rem,6vw,2.6rem)]" : "font-body font-medium uppercase text-xs tracking-[0.08em] py-3"}`}
        style={{
          color: active ? "var(--brand-accent)" : "rgba(255,255,255,0.8)",
        }}
      >
        {group.label}
        <ChevronDown
          size={mobile ? 20 : 14}
          className="transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        className={
          mobile
            ? "pb-4 pl-4 grid gap-1"
            : "absolute top-full left-0 mt-2 w-80 rounded-lg border border-white/15 bg-[var(--brand-backdrop)] p-2 shadow-2xl"
        }
      >
        {group.children.map((link) => {
          const content = (
            <>
              <span className="block font-medium text-sm text-white">
                {link.label}
              </span>
              {link.description && (
                <span className="block mt-1 text-xs leading-relaxed text-white/65">
                  {link.description}
                </span>
              )}
            </>
          );
          const props = {
            className:
              "block rounded-md px-4 py-3 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]",
            "aria-current": currentRoute(pathname, link.href)
              ? ("page" as const)
              : undefined,
            onClick: () => {
              if (detail.current) detail.current.open = false;
              onNavigate();
            },
          };
          return link.href.startsWith("/") && !link.external ? (
            <Link key={link.href} to={link.href} {...props}>
              {content}
            </Link>
          ) : (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              {...props}
            >
              {content}
            </a>
          );
        })}
      </div>
    </details>
  );
}

const Nav = ({ loaded = true }: NavProps) => {
  const siteConfig = useSiteConfig();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const mobileMenuContent = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const { identity, nav, brand, sections } = siteConfig;
  const configuredItems: NavItem[] = nav.items ?? [
    ...nav.hashLinks,
    ...nav.routeLinks,
  ];
  const availableLink = (link: LinkItem) =>
    (link.href !== "/speaking" || sections.speaking) &&
    (!["#story", "/#story"].includes(link.href) || sections.story);
  const navItems = configuredItems.flatMap((item): NavItem[] => {
    if (!("children" in item)) return availableLink(item) ? [item] : [];
    const children = item.children.filter(availableLink);
    return children.length ? [{ ...item, children }] : [];
  });
  const sectionIds = navItems
    .flatMap((item) => ("children" in item ? item.children : [item]))
    .filter((link) => link.href.startsWith("#") || link.href.startsWith("/#"))
    .map((link) => link.href.split("#")[1])
    .join(",");

  const handleHashClick = (e: React.MouseEvent, hash: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    e.preventDefault();
    setMenuOpen(false);
    const id = hash.split("#")[1];
    if (isHome) {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(history.state, "", `/#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    e.preventDefault();
    setMenuOpen(false);
    if (isHome) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      history.replaceState(history.state, "", "/");
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80);
      let current = "";
      for (const id of sectionIds.split(",").filter(Boolean)) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sectionIds, location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const renderItem = (item: NavItem, mobile = false) => {
    if ("children" in item)
      return (
        <ResourceNavigation
          key={item.label}
          group={item}
          mobile={mobile}
          pathname={location.pathname}
          onNavigate={() => setMenuOpen(false)}
        />
      );
    const hash = item.href.startsWith("#") || item.href.startsWith("/#");
    const active = hash
      ? isHome && activeSection === item.href.split("#")[1]
      : currentRoute(location.pathname, item.href);
    const props = {
      "aria-current": active
        ? hash
          ? ("location" as const)
          : ("page" as const)
        : undefined,
      className: mobile
        ? "flex items-center justify-between py-4 font-display italic border-b border-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
        : "nav-link-underline relative font-body font-medium uppercase transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-accent)]",
      style: mobile
        ? {
            fontSize: "clamp(1.8rem, 6vw, 2.6rem)",
            color: active ? brand.accent : "rgba(255,255,255,0.9)",
          }
        : {
            fontSize: 12,
            letterSpacing: "0.08em",
            color: active ? brand.accent : "rgba(255,255,255,0.8)",
          },
    };
    const content = (
      <>
        {item.label}
        {mobile && (
          <ArrowRight
            size={22}
            color="rgba(255,255,255,0.35)"
            aria-hidden="true"
          />
        )}
      </>
    );
    return hash ? (
      <a
        key={item.label}
        href={`/#${item.href.split("#")[1]}`}
        onClick={(event) => handleHashClick(event, item.href)}
        {...props}
      >
        {content}
      </a>
    ) : item.href.startsWith("/") && !item.external ? (
      <Link
        key={item.label}
        to={item.href}
        onClick={() => setMenuOpen(false)}
        {...props}
      >
        {content}
      </Link>
    ) : (
      <a
        key={item.label}
        href={item.href}
        target={item.external ? "_blank" : undefined}
        rel={item.external ? "noopener noreferrer" : undefined}
        onClick={() => setMenuOpen(false)}
        {...props}
      >
        {content}
      </a>
    );
  };

  return (
    <>
      <a
        href="#main-content"
        className="skip-to-content font-body font-bold uppercase"
        style={{ letterSpacing: "0.08em" }}
      >
        Skip to content
      </a>
      <nav
        aria-label="Main navigation"
        className="fixed top-0 left-0 w-full transition-all duration-500 ease-out"
        style={{
          zIndex: 50,
          height: scrolled ? 72 : 88,
          background: scrolled
            ? "rgba(var(--brand-backdrop-rgb),0.94)"
            : "rgba(var(--brand-backdrop-rgb),0.6)",
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
          <a
            href="/"
            onClick={handleLogoClick}
            className="flex items-center gap-3 group"
            data-hover
          >
            <div
              className="flex items-center justify-center transition-shadow duration-300 group-hover:shadow-[0_0_24px_rgba(var(--brand-accent-rgb),0.25)]"
              style={{
                width: 40,
                height: 40,
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
              className="font-body font-medium uppercase"
              style={{
                fontSize: 12,
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {identity.name}
            </span>
          </a>
          <div className="hidden xl:flex items-center gap-4 xl:gap-8">
            <div className="flex items-center gap-4 xl:gap-7">
              {navItems.map((item) => renderItem(item))}
            </div>
            {nav.cta && (
              <>
                <div
                  style={{
                    width: 1,
                    height: 20,
                    background: "rgba(255,255,255,0.1)",
                  }}
                />
                <a
                  href={nav.cta.href}
                  target={nav.cta.external ? "_blank" : undefined}
                  rel={nav.cta.external ? "noopener noreferrer" : undefined}
                  data-hover
                  className="inline-flex items-center gap-1.5 font-body font-bold uppercase transition-opacity duration-300 hover:opacity-90"
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    background: `linear-gradient(135deg, ${brand.accent}, ${brand.accentDark})`,
                    color: brand.backdrop,
                    padding: "13px 20px",
                    borderRadius: 0,
                  }}
                >
                  {nav.cta.label}
                  <ArrowUpRight
                    size={13}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </a>
              </>
            )}
          </div>
          <button
            ref={menuTrigger}
            type="button"
            className="xl:hidden inline-flex items-center justify-center"
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
      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            ref={mobileMenuContent}
            onEscapeKeyDown={(event) => {
              const disclosure =
                mobileMenuContent.current?.querySelector<HTMLDetailsElement>(
                  "details[open]",
                );
              if (!disclosure) return;
              event.preventDefault();
              disclosure.open = false;
              disclosure.querySelector("summary")?.focus();
            }}
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
            <div className="flex-1 flex flex-col justify-center px-8 pb-8">
              {navItems.map((item) => renderItem(item, true))}
            </div>
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
