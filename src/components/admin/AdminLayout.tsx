import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  Files,
  Globe,
  Tags,
  Layers,
  BookOpen,
  Zap,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  FilePlus,
  Sun,
  Moon,
  ImageIcon,
  ExternalLink,
  KeyRound,
} from "lucide-react";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/posts", label: "Posts", icon: FileText, end: true },
  { to: "/admin/posts/new", label: "New Post", icon: FilePlus },
  { to: "/admin/categories", label: "Categories", icon: FolderOpen },
  { to: "/admin/pages", label: "pSEO Pages", icon: Files },
  { to: "/admin/library", label: "Library", icon: ImageIcon },
  { to: "/admin/settings", label: "Settings", icon: KeyRound },
  { to: "/admin/site-settings", label: "Site Config", icon: Globe },
  { to: "/admin/niches", label: "Niches", icon: Tags },
  { to: "/admin/content-types", label: "Content Types", icon: Layers },
  { to: "/admin/pillars", label: "Pillars", icon: BookOpen },
];

const AdminLayout = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lightMode, setLightMode] = useState(() => {
    return localStorage.getItem("admin-theme") === "light";
  });

  useEffect(() => {
    localStorage.setItem("admin-theme", lightMode ? "light" : "dark");
  }, [lightMode]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  return (
    <div className={`admin-shell flex min-h-screen ${lightMode ? "admin-light" : ""}`}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          width: collapsed ? 68 : 240,
          backgroundColor: "hsl(var(--admin-surface))",
          borderRight: "1px solid hsl(var(--admin-border))",
          flexShrink: 0,
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center justify-between"
          style={{ padding: collapsed ? "24px 16px" : "24px 20px" }}
        >
          {!collapsed ? (
            <span
              className="font-body truncate"
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "hsl(var(--admin-text))",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                textDecorationColor: "hsl(var(--admin-accent))",
              }}
            >
              Courtney Hanson
            </span>
          ) : (
            <span
              className="font-body"
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "hsl(var(--admin-text))",
              }}
            >
              CH
            </span>
          )}
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            style={{
              color: "hsl(var(--admin-text-ghost))",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 flex flex-col"
          style={{ padding: collapsed ? "8px 8px" : "8px 12px", gap: 2 }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className="font-body flex items-center rounded"
              style={({ isActive }) => ({
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                gap: collapsed ? 0 : 12,
                justifyContent: collapsed ? "center" : "flex-start",
                color: isActive
                  ? "hsl(var(--admin-accent))"
                  : "hsl(var(--admin-text-soft))",
                padding: collapsed ? "10px" : "10px 12px",
                textDecoration: "none",
                backgroundColor: "transparent",
                transition: "all 0.2s",
                borderRadius: 4,
              })}
            >
              <item.icon size={16} strokeWidth={1.5} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
            </NavLink>
          ))}
          {/* View Site link */}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body flex items-center rounded"
            style={{
              fontSize: 13,
              fontWeight: 400,
              gap: collapsed ? 0 : 12,
              justifyContent: collapsed ? "center" : "flex-start",
              color: "hsl(var(--admin-text-soft))",
              padding: collapsed ? "10px" : "10px 12px",
              textDecoration: "none",
              borderRadius: 4,
              marginTop: 8,
              borderTop: "1px solid hsl(var(--admin-border))",
              paddingTop: 16,
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-accent))")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-text-soft))")
            }
          >
            <ExternalLink size={16} strokeWidth={1.5} />
            {!collapsed && <span>View Site</span>}
          </a>
        </nav>

        {/* Footer */}
        <div
          style={{
            padding: collapsed ? "16px 8px" : "16px 12px",
            borderTop: "1px solid hsl(var(--admin-border))",
          }}
        >
          {!collapsed && user && (
            <div
              className="font-body truncate"
              style={{
                fontSize: 11,
                color: "hsl(var(--admin-text-ghost))",
                padding: "0 12px",
                marginBottom: 12,
              }}
            >
              {user.email}
            </div>
          )}
          <button
            onClick={() => setLightMode(!lightMode)}
            className="font-body flex items-center w-full rounded"
            style={{
              fontSize: 13,
              gap: collapsed ? 0 : 12,
              justifyContent: collapsed ? "center" : "flex-start",
              color: "hsl(var(--admin-text-ghost))",
              padding: collapsed ? "10px" : "10px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
              transition: "color 0.2s",
              marginBottom: 4,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-accent))")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-text-ghost))")
            }
          >
            {lightMode ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
            {!collapsed && (lightMode ? "Dark Mode" : "Light Mode")}
          </button>
          <button
            onClick={handleSignOut}
            className="font-body flex items-center w-full rounded"
            style={{
              fontSize: 13,
              gap: collapsed ? 0 : 12,
              justifyContent: collapsed ? "center" : "flex-start",
              color: "hsl(var(--admin-text-ghost))",
              padding: collapsed ? "10px" : "10px 12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: 4,
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-danger))")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "hsl(var(--admin-text-ghost))")
            }
          >
            <LogOut size={16} strokeWidth={1.5} />
            {!collapsed && "Sign Out"}
          </button>
        </div>

        {/* Collapse toggle - desktop only */}
        <button
          className="hidden lg:flex items-center justify-center"
          onClick={() => setCollapsed(!collapsed)}
          style={{
            padding: "12px",
            background: "none",
            border: "none",
            borderTop: "1px solid hsl(var(--admin-border))",
            cursor: "pointer",
            color: "hsl(var(--admin-text-ghost))",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "hsl(var(--admin-text-soft))")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "hsl(var(--admin-text-ghost))")
          }
        >
          <ChevronLeft
            size={14}
            style={{
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform 0.3s",
            }}
          />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div
          className="lg:hidden flex items-center gap-4"
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid hsl(var(--admin-border))",
            backgroundColor: "hsl(var(--admin-surface))",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              color: "hsl(var(--admin-text))",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
          <span
            className="font-heading italic"
            style={{ fontSize: 16, color: "hsl(var(--admin-text))" }}
          >
            Admin
          </span>
        </div>

        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: "32px 28px" }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
