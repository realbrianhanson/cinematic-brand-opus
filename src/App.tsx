import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import NotFound from "./pages/NotFound";

const AdminLogin = lazy(() => import("./components/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const Dashboard = lazy(() => import("./components/admin/Dashboard"));
const PostsManager = lazy(() => import("./components/admin/PostsManager"));
const PostEditor = lazy(() => import("./components/admin/PostEditor"));
const CategoriesManager = lazy(() => import("./components/admin/CategoriesManager"));
const MediaLibrary = lazy(() => import("./components/admin/MediaLibrary"));
const ChangePassword = lazy(() => import("./components/admin/ChangePassword"));
const GeneratedPagesManager = lazy(() => import("./components/admin/GeneratedPagesManager"));
const GeneratedPageEditor = lazy(() => import("./components/admin/GeneratedPageEditor"));
const SiteSettingsManager = lazy(() => import("./components/admin/SiteSettingsManager"));
import ProtectedRoute from "./components/admin/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/admin/login" element={<Suspense fallback={null}><AdminLogin /></Suspense>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Suspense fallback={null}><AdminLayout /></Suspense>
                </ProtectedRoute>
              }
            >
              <Route index element={<Suspense fallback={null}><Dashboard /></Suspense>} />
              <Route path="posts" element={<Suspense fallback={null}><PostsManager /></Suspense>} />
              <Route path="posts/new" element={<Suspense fallback={null}><PostEditor /></Suspense>} />
              <Route path="posts/:id/edit" element={<Suspense fallback={null}><PostEditor /></Suspense>} />
              <Route path="categories" element={<Suspense fallback={null}><CategoriesManager /></Suspense>} />
              <Route path="pages" element={<Suspense fallback={null}><GeneratedPagesManager /></Suspense>} />
              <Route path="pages/:id/edit" element={<Suspense fallback={null}><GeneratedPageEditor /></Suspense>} />
              <Route path="library" element={<Suspense fallback={null}><MediaLibrary /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={null}><ChangePassword /></Suspense>} />
              <Route path="site-settings" element={<Suspense fallback={null}><SiteSettingsManager /></Suspense>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
