import { z } from "zod";
const schema = z.object({
  brief: z.object({
    reader_question: z.string(),
    search_intent: z.string(),
    format: z.string(),
    original_value: z.string(),
    evidence_limits: z.string(),
    success_check: z.string(),
  }),
  review_warnings: z.array(z.string()).optional(),
});
export default function EditorialBrief({ value }: { value: unknown }) {
  const result = schema.safeParse(value);
  if (!result.success) return null;
  const { brief, review_warnings } = result.data;
  return (
    <section className="admin-card" style={{ padding: 20 }}>
      <h2 className="admin-label">Article brief</h2>
      <dl className="text-sm space-y-3">
        {[
          ["Reader question", brief.reader_question],
          ["Reader task", brief.search_intent],
          ["Format", brief.format.replaceAll("_", " ")],
          ["What this adds", brief.original_value],
          ["Evidence and limits", brief.evidence_limits],
          ["Check the result", brief.success_check],
        ].map(([label, text]) => (
          <div key={label}>
            <dt className="font-semibold">{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      {!!review_warnings?.length && (
        <div className="mt-4" role="status">
          <strong>Review before publishing</strong>
          <ul>
            {review_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
