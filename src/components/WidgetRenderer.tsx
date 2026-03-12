import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SidebarNewsletter from "@/components/widgets/SidebarNewsletter";
import SidebarRecentPosts from "@/components/widgets/SidebarRecentPosts";
import SidebarPopularPosts from "@/components/widgets/SidebarPopularPosts";
import SidebarCategories from "@/components/widgets/SidebarCategories";
import SidebarSocialLinks from "@/components/widgets/SidebarSocialLinks";
import SidebarCustomHTML from "@/components/widgets/SidebarCustomHTML";
import PageAuthorBio from "@/components/widgets/PageAuthorBio";
import PageRelatedPosts from "@/components/widgets/PageRelatedPosts";
import PageShareBar from "@/components/widgets/PageShareBar";
import PageTOC from "@/components/widgets/PageTOC";
import PageReadingProgress from "@/components/widgets/PageReadingProgress";
import PageBackToTop from "@/components/widgets/PageBackToTop";
import FooterColumns from "@/components/widgets/FooterColumns";

const WIDGET_MAP: Record<string, React.ComponentType<{ config: any; pageContext?: any }>> = {
  "sidebar-newsletter": SidebarNewsletter,
  "sidebar-recent-posts": SidebarRecentPosts,
  "sidebar-popular-posts": SidebarPopularPosts,
  "sidebar-categories": SidebarCategories,
  "sidebar-social-links": SidebarSocialLinks,
  "sidebar-custom-html": SidebarCustomHTML,
  "page-author-bio": PageAuthorBio,
  "page-related-posts": PageRelatedPosts,
  "page-share-bar": PageShareBar,
  "page-toc": PageTOC,
  "page-reading-progress": PageReadingProgress,
  "page-back-to-top": PageBackToTop,
  "footer-columns": FooterColumns,
};

interface WidgetRendererProps {
  zone: "sidebar" | "page" | "footer";
  pageContext?: { postId?: string; categoryId?: string; tags?: string[] };
}

const WidgetRenderer = ({ zone, pageContext }: WidgetRendererProps) => {
  const { data: widgets } = useQuery({
    queryKey: ["public-widgets", zone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widget_config")
        .select("*")
        .eq("widget_zone", zone)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
  });

  if (!widgets || widgets.length === 0) return null;

  return (
    <div className={zone === "sidebar" ? "flex flex-col gap-6" : zone === "footer" ? "" : "flex flex-col gap-8"}>
      {widgets.map((widget) => {
        const Component = WIDGET_MAP[widget.widget_slug];
        if (!Component) return null;
        return <Component key={widget.id} config={widget.config || {}} pageContext={pageContext} />;
      })}
    </div>
  );
};

export default WidgetRenderer;
