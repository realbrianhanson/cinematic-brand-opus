const FooterColumns = ({ config }: { config: any }) => {
  const columns = config.columns || 3;
  const content: { title?: string; text?: string }[] = config.content || [];

  if (!content.some((c) => c.title || c.text)) return null;

  return (
    <div
      className="grid gap-8 py-8"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {content.slice(0, columns).map((col, i) => (
        <div key={i}>
          {col.title && (
            <h4 className="font-body font-bold uppercase mb-3" style={{ fontSize: 10, letterSpacing: "0.2em", color: "hsl(var(--accent))" }}>
              {col.title}
            </h4>
          )}
          {col.text && (
            <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
              {col.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default FooterColumns;
