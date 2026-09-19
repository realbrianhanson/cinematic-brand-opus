const Divider = () => (
  <div aria-hidden="true" className="relative h-12 overflow-hidden md:h-16">
    <div
      className="absolute inset-x-0 top-1/2 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(var(--brand-accent-rgb),0.2), transparent)",
      }}
    />
    <div
      className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45"
      style={{ border: "1px solid rgba(var(--brand-accent-rgb),0.4)" }}
    />
  </div>
);

export default Divider;
