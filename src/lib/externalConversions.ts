import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ConversionDays } from "@/lib/conversions";

export const externalConversionColumns = [
  "provider",
  "record_id",
  "outcome",
  "destination",
  "occurred_at",
  "provider_updated_at",
  "status",
  "mode",
  "amount_minor",
  "currency",
  "source",
  "medium",
  "campaign",
] as const;
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const timestamp = z.string().datetime({ offset: true });
export const externalOutcomeSchema = z
  .object({
    provider: slug,
    record_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/),
    outcome: z.enum(["registration", "purchase"]),
    destination: slug,
    occurred_at: timestamp,
    provider_updated_at: timestamp,
    status: z.enum(["confirmed", "cancelled", "refunded"]),
    mode: z.enum(["live", "test", "unknown"]),
    amount_minor: z.number().int().min(1).max(9_000_000_000_000).nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    source: slug.nullable(),
    medium: slug.nullable(),
    campaign: slug.nullable(),
  })
  .strict()
  .superRefine((row, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      row.outcome === "purchase" &&
      (row.amount_minor === null || row.currency === null)
    )
      invalid(
        "Purchases require an integer amount in the currency’s minor units and a currency code.",
      );
    if (
      row.outcome === "registration" &&
      (row.amount_minor !== null ||
        row.currency !== null ||
        row.status === "refunded")
    )
      invalid(
        "Registrations have no amount or currency and cannot be refunded.",
      );
    if (
      Date.parse(row.occurred_at) < Date.UTC(2000, 0, 1) ||
      Date.parse(row.occurred_at) > Date.now() + 300_000 ||
      Date.parse(row.provider_updated_at) < Date.parse(row.occurred_at) ||
      Date.parse(row.provider_updated_at) > Date.now() + 300_000
    )
      invalid(
        "Use valid provider dates with the update at or after the outcome; future dates are not accepted.",
      );
  });
export type ExternalOutcome = z.infer<typeof externalOutcomeSchema>;

/** Strict CSV: no silently dropped contact columns or repaired quote errors. */
function csvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === ",") pushCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (char === '"' || closed)
      throw new Error(
        "Invalid CSV quoting. Use the template and export as CSV.",
      );
    else cell += char;
  }
  if (quoted) throw new Error("An opening CSV quote has no closing quote.");
  if (cell || row.length || closed) pushRow();
  return rows;
}
export function parseExternalOutcomeCsv(text: string): ExternalOutcome[] {
  if (new TextEncoder().encode(text).length > 256 * 1024)
    throw new Error("Choose a CSV smaller than 256 KiB.");
  const [headers, ...rows] = csvCells(text.replace(/^\uFEFF/, ""));
  if (
    !headers ||
    headers.length !== externalConversionColumns.length ||
    new Set(headers).size !== headers.length ||
    headers.some((key) => !externalConversionColumns.includes(key as never))
  )
    throw new Error(
      "Use exactly the template columns. Remove contact details and other columns before importing.",
    );
  if (!rows.length || rows.length > 500)
    throw new Error("Import between 1 and 500 rows at a time.");
  const keys = new Set<string>();
  return rows.map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Row ${index + 2} has the wrong number of columns.`);
    const raw: Record<string, unknown> = Object.fromEntries(
      headers.map((header, position) => [header, cells[position]]),
    );
    for (const key of ["source", "medium", "campaign", "currency"])
      if (raw[key] === "") raw[key] = null;
    raw.amount_minor =
      raw.amount_minor === ""
        ? null
        : /^\d+$/.test(String(raw.amount_minor))
          ? Number(raw.amount_minor)
          : Number.NaN;
    const parsed = externalOutcomeSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(
        `Row ${index + 2}: check IDs, lowercase campaign labels, dates, status, mode and amounts against the template. No email addresses, names or URLs are accepted.`,
      );
    const key = JSON.stringify([
      parsed.data.provider,
      parsed.data.record_id,
      parsed.data.outcome,
    ]);
    if (keys.has(key))
      throw new Error(
        `Row ${index + 2} repeats a provider record and outcome. Keep only the provider’s latest record.`,
      );
    keys.add(key);
    return parsed.data;
  });
}
export const externalConversionTemplate =
  externalConversionColumns.join(",") + "\n";
const count = z.number().int().nonnegative();
export const externalImportResultSchema = z.object({
  id: z.string().uuid(),
  inserted: count,
  updated: count,
  unchanged: count,
  stale: count,
});
export const externalConversionReportSchema = z.object({
  generated_at: timestamp,
  range: z.object({
    start: timestamp,
    end: timestamp,
    timezone: z.literal("UTC"),
  }),
  registrations: count,
  purchases: count,
  excluded_test_or_unknown: count,
  cancelled_or_refunded: count,
  without_campaign: count,
  campaign_groups: count,
  revenue_by_currency: z.array(
    z.object({ currency: z.string(), amount_minor: count }),
  ),
  campaigns: z.array(
    z.object({
      provider: z.string(),
      destination: z.string(),
      source: z.string().nullable(),
      medium: z.string().nullable(),
      campaign: z.string().nullable(),
      registrations: count,
      purchases: count,
    }),
  ),
  imports: z.array(
    externalImportResultSchema.extend({
      reference: z.string(),
      row_count: count,
      imported_at: timestamp,
    }),
  ),
});
export type ExternalConversionReport = z.infer<
  typeof externalConversionReportSchema
>;
// New RPCs are isolated here until the managed schema types are regenerated.
// Parse all responses at the boundary; no change to the shared generated file.
const client = supabase as unknown as {
  rpc: (
    name:
      | "admin_external_conversion_snapshot"
      | "admin_import_external_conversions",
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
export function externalConversionQueryOptions(days: ConversionDays) {
  return queryOptions({
    queryKey: ["admin-external-conversions", days],
    queryFn: async () => {
      const { data, error } = await client.rpc(
        "admin_external_conversion_snapshot",
        { _days: days },
      );
      if (error) throw new Error(error.message);
      return externalConversionReportSchema.parse(data);
    },
    staleTime: 60_000,
  });
}
export async function importExternalOutcomes(
  rows: ExternalOutcome[],
  reference: string,
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(reference))
    throw new Error(
      "Use a short export reference: letters, numbers, dots, hyphens or underscores.",
    );
  const { data, error } = await client.rpc(
    "admin_import_external_conversions",
    { _rows: rows, _reference: reference },
  );
  if (error) throw new Error(error.message);
  return externalImportResultSchema.parse(data);
}
export function externalConversionMoney(amount: number, currency: string) {
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amount / 10 ** digits);
}
