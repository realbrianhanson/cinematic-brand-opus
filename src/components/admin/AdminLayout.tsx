import { useSiteConfig } from "@/config/SiteConfigContext";
import { useState } from "react";
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
} from "lucide-react";
const groups = [
  {
    label: "Workspace",
    items: [
      { to: "/admin", label: "Overview", end: true },
      { to: "/admin/queue", label: "Queue & automation" },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/admin/posts", label: "Articles" },
      { to: "/admin/pages", label: "Resources" },
      { to: "/admin/pillars", label: "Topic guides" },
      { to: "/admin/generate", label: "Generate drafts" },
      { to: "/admin/library", label: "Media library" },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/admin/offers", label: "Offers & funnels" },
      { to: "/admin/pseo-dashboard", label: "Performance" },
      { to: "/admin/niches", label: "Audiences & niches" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/admin/setup", label: "Site setup" },
      { to: "/admin/site-settings", label: "Brand & author" },
      { to: "/admin/settings", label: "Integrations" },
      { to: "/admin/content-types", label: "Content formats" },
      { to: "/admin/categories", label: "Categories" },
      { to: "/admin/widgets", label: "Widgets" },
    ],
  },
];
export default function AdminLayout() {
  const siteConfig = useSiteConfig();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { prefs, updatePref } = useAdminPreferences();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  function navigation(compact = false) {
    return (
      <div className="admin-sidebar-inner">
        <div className="admin-sidebar-brand">
          {compact
            ? siteConfig.identity.logoInitials
            : siteConfig.identity.name}
        </div>
        <Link
          className="admin-btn-primary justify-center"
          to="/admin/posts/new"
          aria-label="New Post"
          title="New Post"
          onClick={() => setOpen(false)}
        >
          <Plus size={17} />
          {!compact && "New Post"}
        </Link>
        <nav aria-label="Admin navigation">
          {groups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              {!compact && <p>{group.label}</p>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin" || item.to === "/admin/posts"}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `admin-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  {compact ? item.label.slice(0, 2) : item.label}
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
        <Link
          className="admin-btn-ghost"
          to="/admin/posts/new"
          aria-label="New Post"
        >
          <Plus size={20} />
        </Link>
      </div>
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
