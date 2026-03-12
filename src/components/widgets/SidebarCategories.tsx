import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SidebarCategories = ({ config }: { config: any }) => {
  const { data: categories } = useQuery({
    queryKey: ["widget-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, slug").order("name");
      return data || [];
    },
    staleTime: 60000,
  });

  if (!categories?.length) return null;

  return (
    <div style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="font-body uppercase mb-4" style={{ fontSize: 10, letterSpacing: "0.15em", color: "hsl(var(--accent))", fontWeight: 700 }}>
        Categories
      </h3>
      <div className="flex flex-col gap-2">
        {categories.map((cat) => (
          <a key={cat.id} href={`/blog?category=${cat.slug}`} className="font-body transition-colors" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          >
            {cat.name}
          </a>
        ))}
      </div>
    </div>
  );
};

export default SidebarCategories;
