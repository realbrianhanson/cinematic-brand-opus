import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import {
  externalConversionColumns,
  externalConversionMoney,
  externalOutcomeSchema,
  importExternalOutcomes,
  parseExternalOutcomeCsv,
} from "../externalConversions";
const values = [
  "provider-export",
  "reg-1",
  "registration",
  "summit-october",
  "2026-01-01T10:00:00Z",
  "2026-01-01T11:00:00Z",
  "confirmed",
  "live",
  "",
  "",
  "email",
  "newsletter",
  "fall",
];
const csv = (
  rows = [values],
  headers: readonly string[] = externalConversionColumns,
) => [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
beforeEach(() => rpc.mockReset());
describe("external provider import", () => {
  it("accepts UTF-8 BOM, reordered headers, CRLF, quoted values and optional attribution", () => {
    const rows = parseExternalOutcomeCsv(
      "\uFEFF" + csv([[...values.slice(0, 10), "", "", ""]]),
    );
    expect(rows[0]).toMatchObject({
      outcome: "registration",
      amount_minor: null,
      currency: null,
      source: null,
      campaign: null,
    });
    const reordered = parseExternalOutcomeCsv(
      csv([[...values].reverse()], [...externalConversionColumns].reverse()),
    );
    expect(reordered[0].record_id).toBe("reg-1");
    expect(
      parseExternalOutcomeCsv(
        csv([[...values.slice(0, 1), '"reg-1"', ...values.slice(2)]]),
      )[0].record_id,
    ).toBe("reg-1");
  });
  it("rejects raw exports containing contact columns, duplicate IDs, malformed quotes and oversized batches", () => {
    expect(() =>
      parseExternalOutcomeCsv(
        csv(
          [[...values, "private@example.test"]],
          [...externalConversionColumns, "email"],
        ),
      ),
    ).toThrow(/template columns/);
    expect(() => parseExternalOutcomeCsv(csv([values, values]))).toThrow(
      /repeats/,
    );
    expect(() =>
      parseExternalOutcomeCsv(
        csv([[...values.slice(0, 1), '"unclosed', ...values.slice(2)]]),
      ),
    ).toThrow(/closing quote/);
    expect(() =>
      parseExternalOutcomeCsv(
        csv([[...values.slice(0, 1), '"closed"suffix', ...values.slice(2)]]),
      ),
    ).toThrow(/quoting/);
    expect(() =>
      parseExternalOutcomeCsv(csv(Array.from({ length: 501 }, () => values))),
    ).toThrow(/500/);
    expect(() => parseExternalOutcomeCsv("x".repeat(262145))).toThrow(
      /256 KiB/,
    );
  });
  it("rejects payment fabrication, PII, unsupported status and local dates", () => {
    const registration = parseExternalOutcomeCsv(csv())[0];
    for (const delta of [
      { record_id: "person@example.test" },
      { campaign: "https://private.test" },
      { source: "First Last" },
      { outcome: "purchase" },
      { status: "refunded" },
      { occurred_at: "2026-01-01" },
      { provider_updated_at: "2025-01-01T12:00:00Z" },
    ]) {
      expect(
        externalOutcomeSchema.safeParse({ ...registration, ...delta }).success,
      ).toBe(false);
    }
    expect(
      externalOutcomeSchema.safeParse({
        ...registration,
        outcome: "purchase",
        amount_minor: 700,
        currency: "USD",
      }).success,
    ).toBe(true);
  });
  it("requires integer minor units and formats currencies with the correct exponent", () => {
    for (const amount of ["-1", "1.5", "1e3", "9000000000001"]) {
      const purchase = [...values];
      purchase[2] = "purchase";
      purchase[8] = amount;
      purchase[9] = "USD";
      expect(() => parseExternalOutcomeCsv(csv([purchase]))).toThrow(/Row 2/);
    }
    expect(externalConversionMoney(700, "USD")).toMatch(/7\.00/);
    expect(externalConversionMoney(700, "JPY")).toMatch(/700/);
    expect(externalConversionMoney(1234, "KWD")).toMatch(/1\.234/);
  });
  it("uses the authenticated import boundary and rejects an invalid reference before sending", async () => {
    const rows = parseExternalOutcomeCsv(csv());
    await expect(
      importExternalOutcomes(rows, "private@example.test"),
    ).rejects.toThrow(/export reference/);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({
      data: {
        id: "10000000-0000-4000-8000-000000000001",
        inserted: 1,
        updated: 0,
        unchanged: 0,
        stale: 0,
      },
      error: null,
    });
    expect(await importExternalOutcomes(rows, "fall-2026")).toMatchObject({
      inserted: 1,
    });
    expect(rpc).toHaveBeenCalledWith("admin_import_external_conversions", {
      _rows: rows,
      _reference: "fall-2026",
    });
  });
});
