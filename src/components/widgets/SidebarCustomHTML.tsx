const SidebarCustomHTML = ({ config }: { config: any }) => {
  if (!config.html) return null;
  return (
    <div
      style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}
      dangerouslySetInnerHTML={{ __html: config.html }}
    />
  );
};

export default SidebarCustomHTML;
