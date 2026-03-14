const AdminPageSkeleton = () => (
  <div style={{ padding: 32 }}>
    <div className="animate-pulse" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Title bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ width: 200, height: 28, borderRadius: 6, background: "hsl(var(--admin-surface-2, 230 18% 12%))" }} />
        <div style={{ width: 100, height: 36, borderRadius: 6, background: "hsl(var(--admin-surface-2, 230 18% 12%))" }} />
      </div>
      {/* Content rows */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            borderRadius: 6,
            background: "hsl(var(--admin-surface-2, 230 18% 12%))",
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
    </div>
  </div>
);

export default AdminPageSkeleton;
