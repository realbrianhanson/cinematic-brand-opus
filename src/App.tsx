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
import PillarPage from "./pages/PillarPage";
import ResourcesIndex from "./pages/ResourcesIndex";
import ContentTypeList from "./pages/ContentTypeList";
import GeneratedPage from "./pages/GeneratedPage";
import NotFound from "./pages/NotFound";
import HTMLSitemap from "./pages/HTMLSitemap";

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
const NichesManager = lazy(() => import("./components/admin/NichesManager"));
const ContentTypesManager = lazy(() => import("./components/admin/ContentTypesManager"));
const ContentTypeEditor = lazy(() => import("./components/admin/ContentTypeEditor"));
const PillarPagesManager = lazy(() => import("./components/admin/PillarPagesManager"));
const PillarPageEditor = lazy(() => import("./components/admin/PillarPageEditor"));
const GenerationControls = lazy(() => import("./components/admin/GenerationControls"));
const PseoDashboard = lazy(() => import("./components/admin/PseoDashboard"));
const WidgetsManager = lazy(() => import("./components/admin/WidgetsManager"));
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
            <Route path="/guides/:slug" element={<PillarPage />} />
            <Route path="/resources" element={<ResourcesIndex />} />
            <Route path="/resources/:contentType" element={<ContentTypeList />} />
            <Route path="/resources/:contentType/:nicheSlug" element={<GeneratedPage />} />
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
              <Route path="niches" element={<Suspense fallback={null}><NichesManager /></Suspense>} />
              <Route path="content-types" element={<Suspense fallback={null}><ContentTypesManager /></Suspense>} />
              <Route path="content-types/new" element={<Suspense fallback={null}><ContentTypeEditor /></Suspense>} />
              <Route path="content-types/:id/edit" element={<Suspense fallback={null}><ContentTypeEditor /></Suspense>} />
              <Route path="pillars" element={<Suspense fallback={null}><PillarPagesManager /></Suspense>} />
              <Route path="pillars/new" element={<Suspense fallback={null}><PillarPageEditor /></Suspense>} />
              <Route path="pillars/:id/edit" element={<Suspense fallback={null}><PillarPageEditor /></Suspense>} />
              <Route path="generate" element={<Suspense fallback={null}><GenerationControls /></Suspense>} />
              <Route path="pseo-dashboard" element={<Suspense fallback={null}><PseoDashboard /></Suspense>} />
              <Route path="widgets" element={<Suspense fallback={null}><WidgetsManager /></Suspense>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
