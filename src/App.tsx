import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AriaLiveAnnouncer } from "@/components/AriaLiveAnnouncer";
import { lazy, Suspense } from "react";
import PublicPageSkeleton from "@/components/PublicPageSkeleton";
import AdminPageSkeleton from "@/components/admin/AdminPageSkeleton";
import Index from "./pages/Index";
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const PillarPage = lazy(() => import("./pages/PillarPage"));
const ResourcesIndex = lazy(() => import("./pages/ResourcesIndex"));
const ContentTypeList = lazy(() => import("./pages/ContentTypeList"));
const GeneratedPage = lazy(() => import("./pages/GeneratedPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const HTMLSitemap = lazy(() => import("./pages/HTMLSitemap"));

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
      <AriaLiveAnnouncer>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/blog" element={<Suspense fallback={<PublicPageSkeleton />}><Blog /></Suspense>} />
            <Route path="/blog/:slug" element={<Suspense fallback={<PublicPageSkeleton />}><BlogPost /></Suspense>} />
            <Route path="/guides/:slug" element={<Suspense fallback={<PublicPageSkeleton />}><PillarPage /></Suspense>} />
            <Route path="/resources" element={<Suspense fallback={<PublicPageSkeleton />}><ResourcesIndex /></Suspense>} />
            <Route path="/resources/:contentType" element={<Suspense fallback={<PublicPageSkeleton />}><ContentTypeList /></Suspense>} />
            <Route path="/resources/:contentType/:nicheSlug" element={<Suspense fallback={<PublicPageSkeleton />}><GeneratedPage /></Suspense>} />
            <Route path="/sitemap" element={<Suspense fallback={<PublicPageSkeleton />}><HTMLSitemap /></Suspense>} />
            <Route path="/admin/login" element={<Suspense fallback={<PublicPageSkeleton />}><AdminLogin /></Suspense>} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Suspense fallback={null}><AdminLayout /></Suspense>
                </ProtectedRoute>
              }
            >
              <Route index element={<Suspense fallback={<AdminPageSkeleton />}><Dashboard /></Suspense>} />
              <Route path="posts" element={<Suspense fallback={<AdminPageSkeleton />}><PostsManager /></Suspense>} />
              <Route path="posts/new" element={<Suspense fallback={<AdminPageSkeleton />}><PostEditor /></Suspense>} />
              <Route path="posts/:id/edit" element={<Suspense fallback={<AdminPageSkeleton />}><PostEditor /></Suspense>} />
              <Route path="categories" element={<Suspense fallback={<AdminPageSkeleton />}><CategoriesManager /></Suspense>} />
              <Route path="pages" element={<Suspense fallback={<AdminPageSkeleton />}><GeneratedPagesManager /></Suspense>} />
              <Route path="pages/:id/edit" element={<Suspense fallback={<AdminPageSkeleton />}><GeneratedPageEditor /></Suspense>} />
              <Route path="library" element={<Suspense fallback={<AdminPageSkeleton />}><MediaLibrary /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<AdminPageSkeleton />}><ChangePassword /></Suspense>} />
              <Route path="site-settings" element={<Suspense fallback={<AdminPageSkeleton />}><SiteSettingsManager /></Suspense>} />
              <Route path="niches" element={<Suspense fallback={<AdminPageSkeleton />}><NichesManager /></Suspense>} />
              <Route path="content-types" element={<Suspense fallback={<AdminPageSkeleton />}><ContentTypesManager /></Suspense>} />
              <Route path="content-types/new" element={<Suspense fallback={<AdminPageSkeleton />}><ContentTypeEditor /></Suspense>} />
              <Route path="content-types/:id/edit" element={<Suspense fallback={<AdminPageSkeleton />}><ContentTypeEditor /></Suspense>} />
              <Route path="pillars" element={<Suspense fallback={<AdminPageSkeleton />}><PillarPagesManager /></Suspense>} />
              <Route path="pillars/new" element={<Suspense fallback={<AdminPageSkeleton />}><PillarPageEditor /></Suspense>} />
              <Route path="pillars/:id/edit" element={<Suspense fallback={<AdminPageSkeleton />}><PillarPageEditor /></Suspense>} />
              <Route path="generate" element={<Suspense fallback={<AdminPageSkeleton />}><GenerationControls /></Suspense>} />
              <Route path="pseo-dashboard" element={<Suspense fallback={<AdminPageSkeleton />}><PseoDashboard /></Suspense>} />
              <Route path="widgets" element={<Suspense fallback={<AdminPageSkeleton />}><WidgetsManager /></Suspense>} />
            </Route>
            <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </AriaLiveAnnouncer>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
