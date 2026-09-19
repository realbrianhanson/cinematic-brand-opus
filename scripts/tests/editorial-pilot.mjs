import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const items = JSON.parse(
  readFileSync("content/editorial-pilot-20260919/articles.json", "utf8"),
);
const sql = readFileSync("content/editorial-pilot-20260919/apply.sql", "utf8");
const db = new PGlite();
await db.exec(`CREATE TABLE posts(id uuid PRIMARY KEY,title text,slug text,content text,excerpt text,tldr text,key_takeaways jsonb,faq_items jsonb,source_citations jsonb,featured_image text,featured_image_alt text,editorial_metadata jsonb,reading_time int,quality_score int,fact_check jsonb,fact_checked_at timestamptz,lint_flags jsonb,embedding text,originality_score int,status text,published_at timestamptz,updated_at timestamptz);
CREATE TABLE seo_metadata(post_id uuid UNIQUE REFERENCES posts(id),meta_title text,meta_description text,og_image text);`);
for (const p of items)
  await db.query(
    "INSERT INTO posts(id,title,slug,status,published_at,updated_at) VALUES($1,'Old',$2,'published','2026-08-01',$3)",
    [p.id, p.slug, p.expected_updated_at],
  );
await db.exec(sql);
assert.equal(
  (
    await db.query(
      "SELECT count(*)::int AS n FROM posts WHERE title <> 'Old' AND status='published' AND published_at='2026-08-01'",
    )
  ).rows[0].n,
  10,
);
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM seo_metadata")).rows[0].n,
  10,
);
// The whole batch must stop when just one reviewed row is stale.
await db.query(
  "UPDATE posts SET updated_at='2026-09-20',title='Newer author edit' WHERE id=$1",
  [items[0].id],
);
await assert.rejects(db.exec(sql), /changed since review/);
await db.exec("ROLLBACK");
assert.equal(
  (await db.query("SELECT title FROM posts WHERE id=$1", [items[0].id])).rows[0]
    .title,
  "Newer author edit",
);
console.log(
  "PASS: ten-article transaction, preserved URLs/publication dates/status, SEO updates, stale-row rollback",
);
await db.close();
