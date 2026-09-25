type ImportResult = { data: unknown; error: { message: string } | null };
interface ImportQuery extends PromiseLike<ImportResult> {
  select(columns: string): ImportQuery;
  single(): PromiseLike<ImportResult>;
  eq(column: string, value: unknown): ImportQuery;
  abortSignal(signal: AbortSignal): ImportQuery;
}
interface ImportDatabase {
  from(table: string): {
    insert(
      values: Record<string, unknown> | Record<string, unknown>[],
    ): ImportQuery;
    update(values: Record<string, unknown>): ImportQuery;
    delete(): ImportQuery;
  };
  rpc(name: string, args: Record<string, unknown>): ImportQuery;
}

export type SearchRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export function resolveGscProperty(
  configured: unknown,
  siteUrl: unknown,
): string {
  const property = typeof configured === "string" ? configured.trim() : "";
  if (
    /^sc-domain:[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(
      property,
    )
  )
    return property;
  const candidate =
    property ||
    (typeof siteUrl === "string"
      ? siteUrl.trim().replace(/\/+$/, "") + "/"
      : "");
  try {
    const url = new URL(candidate);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.hostname.includes(".") &&
      !/\s/.test(candidate)
    )
      return url.href;
  } catch {
    /* reported below */
  }
  throw new Error(
    "Configure the exact Search Console property in Site Config before importing.",
  );
}

export async function stageGscImport(
  db: ImportDatabase,
  period: { property: string; start: string; end: string },
  load: () => Promise<SearchRow[]>,
): Promise<{ rows: number }> {
  const { data: job, error: startError } = await db
    .from("gsc_imports")
    .insert({
      property: period.property,
      period_start: period.start,
      period_end: period.end,
    })
    .select("id")
    .abortSignal(AbortSignal.timeout(15000))
    .single();
  if (startError) throw startError;
  if (
    !job ||
    typeof job !== "object" ||
    !("id" in job) ||
    typeof job.id !== "string"
  )
    throw new Error(
      "The import could not be started. Existing data is unchanged.",
    );
  try {
    const rows = await load();
    if (!Array.isArray(rows))
      throw new Error(
        "Search Console returned an invalid report. Existing data is unchanged.",
      );
    // Reject malformed rows instead of publishing a deceptively incomplete dataset.
    const batch = rows.map((row, index) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !Array.isArray(row.keys) ||
        row.keys.length !== 2 ||
        row.keys.some((key) => typeof key !== "string" || !key.trim()) ||
        [row.clicks, row.impressions, row.ctr, row.position].some(
          (value) =>
            typeof value !== "number" || !Number.isFinite(value) || value < 0,
        ) ||
        row.ctr! > 1
      )
        throw new Error(
          "Search Console returned an invalid row. Existing data is unchanged.",
        );
      return {
        import_id: job.id,
        row_number: index,
        page_url: row.keys[0],
        query: row.keys[1],
        clicks: Math.round(row.clicks!),
        impressions: Math.round(row.impressions!),
        ctr: row.ctr!,
        position: row.position!,
      };
    });
    for (let i = 0; i < batch.length; i += 1000) {
      const { error } = await db
        .from("gsc_import_rows")
        .insert(batch.slice(i, i + 1000))
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
    }
    const { data, error } = await db
      .rpc("gsc_finish_import", {
        _import_id: job.id,
        _expected_rows: batch.length,
      })
      .abortSignal(AbortSignal.timeout(30000));
    if (error) throw error;
    if (
      !data ||
      typeof data !== "object" ||
      !("saved" in data) ||
      data.saved !== true
    )
      throw new Error("The import completion was not confirmed.");
    return { rows: batch.length };
  } catch (error) {
    // A lost activation response may already have committed. Never relabel a
    // completed import as failed or delete active performance rows in cleanup.
    const message =
      error instanceof Error
        ? error.message
        : "Search Console import failed. Check the integration and retry.";
    await db
      .from("gsc_imports")
      .update({
        status: "failed",
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "importing")
      .abortSignal(AbortSignal.timeout(15000));
    await db
      .from("gsc_import_rows")
      .delete()
      .eq("import_id", job.id)
      .abortSignal(AbortSignal.timeout(15000));
    throw error;
  }
}
