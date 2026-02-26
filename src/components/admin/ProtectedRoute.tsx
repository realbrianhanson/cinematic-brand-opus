import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="admin-shell min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 20,
              height: 20,
              border: "2px solid hsl(var(--admin-border))",
              borderTopColor: "hsl(var(--admin-accent))",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p className="font-body" style={{ color: "hsl(var(--admin-text-ghost))" }}>
            Loading...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
