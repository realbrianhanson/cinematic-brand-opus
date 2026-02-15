const items = [
  "4× INC. 5000",
  "150,000+ COMMUNITY",
  "REAL ADVISORS",
  "AI FOR BUSINESS",
  "REVVEN — 3,000+ USERS",
  "$50M+ REVENUE INFLUENCED",
  "20+ YEARS MARKETING",
  "BUILT WITHOUT CODE",
];

const repeated = [...items, ...items, ...items, ...items];

const ProofBar = () => {
  return (
    <section
      id="proof"
      className="relative py-10 overflow-hidden"
      style={{ background: "#08080F" }}
    >
      {/* Top border */}
      <div className="absolute top-0 left-0 w-full h-px" style={{
        background: "linear-gradient(90deg, transparent, rgba(212,175,85,0.12), transparent)",
      }} />
      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 w-full h-px" style={{
        background: "linear-gradient(90deg, transparent, rgba(212,175,85,0.12), transparent)",
      }} />

      {/* Marquee container with edge fade */}
      <div style={{
        maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
      }}>
        <div className="flex items-center gap-16 proof-marquee">
          {repeated.map((item, i) => (
            <div key={i} className="flex items-center gap-2 shrink-0">
              <div
                className="shrink-0"
                style={{
                  width: 3,
                  height: 3,
                  background: "#D4AF55",
                  transform: "rotate(45deg)",
                }}
              />
              <span
                className="font-body font-semibold uppercase whitespace-nowrap"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.22)",
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProofBar;
