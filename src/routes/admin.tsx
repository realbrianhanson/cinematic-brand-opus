import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import AdminLayout from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin")({
  component: () => (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <AdminLayout />
      </Suspense>
      <Outlet />
    </ProtectedRoute>
  ),
});
