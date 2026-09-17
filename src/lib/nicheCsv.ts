const HEADERS = new Set([
  "name",
  "slug",
  "audience",
  "pain_points",
  "monetization",
  "content_that_works",
  "subtopics",
]);
export function parseNicheCsv(
  input: string,
  existingSlugs: string[] = [],
): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const cell = () => {
    row.push(field.trim());
    field = "";
    closed = false;
  };
  const line = () => {
    cell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") {
      line();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"') {
      if (field.trim() || closed) throw new Error("Unexpected quote in CSV.");
      field = "";
      quoted = true;
    } else if (closed && !/\s/.test(char))
      throw new Error("Unexpected text after a quoted CSV field.");
    else field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  if (field || row.length || closed) line();
  const headers = (rows.shift() ?? []).map((h) => h.toLowerCase());
  if (!headers.includes("name")) throw new Error("CSV requires a name column.");
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV contains duplicate column names.");
  if (headers.some((h) => !HEADERS.has(h)))
    throw new Error(
      `Unknown columns: ${headers.filter((h) => !HEADERS.has(h)).join(", ")}`,
    );
  if (!rows.length) throw new Error("CSV contains no niches.");
  if (rows.length > 500)
    throw new Error("Import at most 500 niches at a time.");
  const seen = new Set(existingSlugs);
  return rows.map((cells, i) => {
    if (cells.length !== headers.length)
      throw new Error(
        `Row ${i + 2}: expected ${headers.length} fields; found ${cells.length}.`,
      );
    const result = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    if (!result.name) throw new Error(`Row ${i + 2}: name is required.`);
    result.slug =
      result.slug ||
      result.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug))
      throw new Error(
        `Row ${i + 2}: supply a URL slug using letters, numbers and hyphens.`,
      );
    if (seen.has(result.slug))
      throw new Error(
        `Row ${i + 2}: duplicate slug "${result.slug}". Rename it before importing.`,
      );
    seen.add(result.slug);
    return result;
  });
}
