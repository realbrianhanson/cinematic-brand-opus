const PublicPageSkeleton = () => (
  <div
    className="min-h-screen flex flex-col items-center justify-center"
    style={{ backgroundColor: "var(--bg-deep)" }}
  >
    <div
      className="animate-pulse"
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, rgba(var(--brand-accent-rgb),0.15), rgba(var(--brand-accent-rgb),0.05))",
      }}
    />
  </div>
);

export default PublicPageSkeleton;
