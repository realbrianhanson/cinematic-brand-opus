import {
  LayoutDashboard,
  ListChecks,
  FileText,
  FolderOpen,
  BookOpen,
  Sparkles,
  Image,
  ShoppingBag,
  ChartNoAxesCombined,
  Users,
  Settings2,
  ContactRound,
  ShieldCheck,
  Shapes,
  Tags,
  PanelsTopLeft,
  Mic,
  MousePointerClick,
  Mail,
} from "lucide-react";
export const adminNavigation = [
  {
    label: "Workspace",
    items: [
      { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/admin/queue", label: "Queue & automation", icon: ListChecks },
    ],
  },
  {
    label: "Business",
    items: [
      {
        to: "/admin/conversions",
        label: "Conversions",
        icon: MousePointerClick,
      },
      { to: "/admin/offers", label: "Offers & shop", icon: ShoppingBag },
      { to: "/admin/inquiries", label: "Speaking inquiries", icon: Mic },
      { to: "/admin/audience", label: "Newsletter audience", icon: Mail },
      {
        to: "/admin/pseo-dashboard",
        label: "Search performance",
        icon: ChartNoAxesCombined,
      },
    ],
  },
  {
    label: "Publishing",
    items: [
      { to: "/admin/posts", label: "Articles", icon: FileText },
      { to: "/admin/pages", label: "Resources", icon: FolderOpen },
      { to: "/admin/pillars", label: "Topic guides", icon: BookOpen },
      { to: "/admin/generate", label: "Generate drafts", icon: Sparkles },
      { to: "/admin/library", label: "Media library", icon: Image },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/admin/setup", label: "Site setup", icon: Settings2 },
      {
        to: "/admin/site-settings",
        label: "Brand & publishing",
        icon: ContactRound,
      },
      { to: "/admin/settings", label: "Account security", icon: ShieldCheck },
      { to: "/admin/niches", label: "Audiences & niches", icon: Users },
      { to: "/admin/content-types", label: "Content formats", icon: Shapes },
      { to: "/admin/categories", label: "Categories", icon: Tags },
      { to: "/admin/widgets", label: "Widgets", icon: PanelsTopLeft },
    ],
  },
];
export const adminCreateActions = [
  {
    to: "/admin/posts/new",
    label: "New article",
    description: "Write and publish a post",
    icon: FileText,
  },
  {
    to: "/admin/offers/new",
    label: "New offer",
    description: "Add a product, download, or affiliate link",
    icon: ShoppingBag,
  },
];
