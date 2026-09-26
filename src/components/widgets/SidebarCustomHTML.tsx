import type { WidgetConfig, WidgetPageContext } from "@/lib/widgetConfig";
import { safeHtml } from "@/lib/safeHtml";

const SidebarCustomHTML = ({ config }: { config: WidgetConfig }) => {
  if (!config.html) return null;
  return (
    <div
      style={{
        padding: 24,
        border: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.06)",
      }}
      dangerouslySetInnerHTML={{ __html: safeHtml(config.html) }}
    />
  );
};

export default SidebarCustomHTML;
