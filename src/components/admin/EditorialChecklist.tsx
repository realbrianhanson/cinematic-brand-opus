import { useState } from "react";
export default function EditorialChecklist({ html }: { html: string }) {
  const links = (html.match(/href=["']https?:\/\//g) || []).length;
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  return (
    <section className="admin-card admin-section">
      <h2>Editorial review</h2>
      <p className="admin-help">
        A human review, not a ranking score. Links and AI checks do not prove a
        claim is true.
      </p>
      <p className="admin-help">{links} external source links detected.</p>
      {[
        "The article answers a specific reader question",
        "Product, pricing, and result claims match primary sources",
        "Examples are real; personal experience is not invented",
        "Original insight or a useful demonstration adds value",
        "Relevant internal links and the next step are included",
      ].map((label) => (
        <label key={label} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!checks[label]}
            onChange={(e) =>
              setChecks({ ...checks, [label]: e.target.checked })
            }
          />
          {label}
        </label>
      ))}
      <p className="admin-help">
        This checklist is a review aid for the current session. The Publish
        readiness card shows the checks the server runs before anything goes
        live.
      </p>
    </section>
  );
}
