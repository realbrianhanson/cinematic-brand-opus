export function CtaPreview({
  headline,
  subtext,
  buttonText,
  socialProof,
}: {
  headline: string;
  subtext: string;
  buttonText: string;
  socialProof: string;
}) {
  return (
    <section className="admin-card min-w-0" style={{ padding: 24 }}>
      <h2
        className="font-body"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 16,
        }}
      >
        CTA Preview
      </h2>
      <div
        style={{
          padding: 28,
          borderRadius: 10,
          background: `linear-gradient(135deg, hsl(var(--admin-accent) / 0.12), hsl(var(--admin-surface-2)))`,
          border: "1px solid hsl(var(--admin-accent) / 0.2)",
          textAlign: "center",
          overflowWrap: "anywhere",
        }}
      >
        <p
          className="font-body"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "hsl(var(--admin-text))",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          {headline || "Your Headline"}
        </p>
        <p
          className="font-body"
          style={{
            fontSize: 13,
            color: "hsl(var(--admin-text-soft))",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {subtext || "Your subtext goes here."}
        </p>
        <div
          className="font-body"
          style={{
            display: "inline-block",
            maxWidth: "100%",
            padding: "10px 28px",
            borderRadius: 6,
            backgroundColor: "hsl(var(--admin-accent))",
            color: "hsl(var(--admin-accent-fg))",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {buttonText || "Button Text"}
        </div>
        {socialProof && (
          <p
            className="font-body"
            style={{
              fontSize: 11,
              color: "hsl(var(--admin-text-ghost))",
              marginTop: 12,
              fontStyle: "italic",
            }}
          >
            {socialProof}
          </p>
        )}
      </div>
      <p
        className="font-body"
        style={{
          fontSize: 11,
          color: "hsl(var(--admin-text-ghost))",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        Live preview — updates as you type
      </p>
    </section>
  );
}
