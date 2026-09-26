/** An opaque database token; timestamps and browser clocks are not versions. */
export function newsEditVersion(row: unknown): string {
  const token =
    row && typeof row === "object" && "edit_version" in row
      ? row.edit_version
      : null;
  if (
    typeof token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token,
    )
  )
    throw new Error(
      "News version protection is unavailable. Finish the database update, then reload this article.",
    );
  return token;
}

export class NewsEditConflict extends Error {
  constructor() {
    super(
      "This article changed since you opened it. Your edits are still here. Compare the latest saved version before saving again.",
    );
    this.name = "NewsEditConflict";
  }
}

interface NewsUpdateQuery {
  eq(column: string, value: string): NewsUpdateQuery;
  select(columns: string): {
    maybeSingle(): PromiseLike<{
      data: unknown | null;
      error: { message: string } | null;
    }>;
  };
}
interface NewsWriteClient {
  from(table: "source_items"): {
    update(values: Record<string, unknown>): NewsUpdateQuery;
  };
}

/** All completion paths, including optional image backfill, compare the original read. */
export async function updateNewsIfCurrent(
  client: NewsWriteClient,
  id: string,
  version: string,
  values: Record<string, unknown>,
): Promise<void> {
  newsEditVersion({ edit_version: version });
  const { data, error } = await client
    .from("source_items")
    .update(values)
    .eq("id", id)
    .eq("edit_version", version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NewsEditConflict();
}
