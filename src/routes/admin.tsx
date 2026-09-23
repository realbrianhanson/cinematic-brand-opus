import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import { Suspense } from "react";
import ProtectedRoute from "@/components/admin/ProtectedRoute";
import AdminLayout from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin")({
  head: adminHead("Admin"),
  component: () => (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <AdminLayout />
      </Suspense>
    </ProtectedRoute>
  ),
});
