import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps each managed function's dependency graph inside its own folder or _shared", () => {
  const root = resolve(process.cwd(), "supabase/functions");
  const functions = readdirSync(root, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== "_shared",
  );
  expect(functions.length).toBeGreaterThan(0);
  for (const entry of functions) {
    const visited = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      const folder = relative(root, file).split(sep)[0];
      // Managed deployment excludes neighboring function folders, even though
      // a repository-wide Deno check can successfully resolve those imports.
      expect(
        [entry.name, "_shared"],
        `${entry.name} cannot package ${relative(root, file)}`,
      ).toContain(folder);
      const source = readFileSync(file, "utf8");
      for (const imported of ts.preProcessFile(source, true, true)
        .importedFiles) {
        if (imported.fileName.startsWith(".")) {
          visit(resolve(dirname(file), imported.fileName));
        }
      }
    };
    visit(resolve(root, entry.name, "index.ts"));
  }
});
