import { useSiteConfig } from "@/config/SiteConfigContext";
import { useEffect, useState } from "react";
import { useAdminPreferences } from "@/hooks/useAdminPreferences";
import { Link, NavLink, Outlet, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Plus,
  Menu,
  ChevronLeft,
  Moon,
  Sun,
  LogOut,
  ExternalLink,
  Search,
  ChevronDown,
} from "lucide-react";
import { adminCreateActions, adminNavigation } from "./adminNavigation";
import AdminCommandMenu from "./AdminCommandMenu";
import {
  clearAdminPreviewBrowser,
  markAdminPreviewBrowser,
} from "@/lib/adminPreviewCookie";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import "./admin-workspace.css";
export default function AdminLayout() {
  const siteConfig = useSiteConfig();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { prefs, updatePref } = useAdminPreferences();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Draft previews open public URLs; keep them out of the 404 -> home redirect.
  useEffect(() => markAdminPreviewBrowser(), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  function createMenu(compact = false) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="admin-btn-primary justify-center w-full"
            aria-label="Create new content"
            title="Create new content"
          >
            <Plus size={17} />
            {!compact && (
              <>
                Create <ChevronDown size={14} />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {adminCreateActions.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <Link
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex gap-3 py-3"
              >
                <item.icon size={18} />
                <span>
                  <strong className="block">{item.label}</strong>
                  <span className="text-xs text-muted-foreground in-data-highlighted:text-accent-foreground">
                    {item.description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  function navigation(compact = false) {
    return (
      <div className="admin-sidebar-inner">
        <div className="admin-sidebar-brand">
          {compact
            ? siteConfig.identity.logoInitials
            : siteConfig.identity.name}
        </div>
        {createMenu(compact)}
        <button
          className="admin-workspace-search"
          onClick={() => {
            setOpen(false);
            setSearchOpen(true);
          }}
          aria-label="Go to page"
          title="Go to page (⌘ / Ctrl + K)"
        >
          <Search size={17} aria-hidden="true" />
          {!compact && (
            <>
              <span aria-hidden="true">Go to page</span>
              <kbd>⌘ K</kbd>
            </>
          )}
        </button>
        <nav aria-label="Admin navigation">
          {adminNavigation.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              {!compact && <p>{group.label}</p>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin"}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `admin-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  <item.icon size={17} aria-hidden="true" />
                  {!compact && item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {!compact && (
            <p title={user?.email} className="truncate admin-help">
              {user?.email}
            </p>
          )}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn-ghost"
            aria-label="View site"
          >
            <ExternalLink size={16} />
            {!compact && "View site"}
          </a>
          <button
            className="admin-btn-ghost"
            aria-label="Toggle color theme"
            onClick={() =>
              updatePref("theme", prefs.theme === "light" ? "dark" : "light")
            }
          >
            {prefs.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            {!compact && (prefs.theme === "light" ? "Dark mode" : "Light mode")}
          </button>
          <button
            className="admin-btn-ghost"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              clearAdminPreviewBrowser();
              navigate("/admin/login");
            }}
          >
            <LogOut size={16} />
            {!compact && "Sign out"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      data-admin-shell
      className={`admin-shell min-h-screen ${prefs.theme === "light" ? "admin-light" : ""}`}
    >
      <a href="#admin-main" className="skip-to-content">
        Skip to content
      </a>
      <aside
        className="hidden lg:block admin-sidebar"
        style={{ width: collapsed ? 88 : 244 }}
      >
        {navigation(collapsed)}
        <button
          className="admin-sidebar-collapse"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            size={16}
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          />
        </button>
      </aside>
      <div className="lg:hidden admin-mobile-bar">
        <button
          className="admin-btn-ghost"
          aria-label="Open admin navigation"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} />
        </button>
        <strong>{siteConfig.identity.name}</strong>
        <button
          className="admin-btn-ghost"
          onClick={() => setSearchOpen(true)}
          aria-label="Go to page"
          title="Go to page (⌘ / Ctrl + K)"
        >
          <Search size={20} />
        </button>
      </div>
      <AdminCommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className={`admin-shell p-0 w-72 ${prefs.theme === "light" ? "admin-light" : ""}`}
        >
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          {navigation()}
        </SheetContent>
      </Sheet>
      <main
        id="admin-main"
        tabIndex={-1}
        className="admin-main"
        style={
          {
            "--sidebar-width": collapsed ? "88px" : "244px",
          } as React.CSSProperties
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
