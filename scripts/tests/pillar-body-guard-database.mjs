import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Table and original trigger as created by 20260312171802_*.sql.
await db.exec(`create role anon;create role authenticated;
create table public.pillar_pages(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, title text not null, content text not null,
  seo_meta jsonb default '{}', status text default 'draft',
  published_at timestamptz, updated_at timestamptz default now());
create or replace function public.validate_pillar_pages_status() returns trigger language plpgsql as $$
begin
  if NEW.status not in ('draft','published') then
    raise exception 'Invalid status: %. Must be draft or published.', NEW.status;
  end if;
  return NEW;
end $$;
create trigger trg_validate_pillar_pages_status before insert or update on public.pillar_pages
  for each row execute function public.validate_pillar_pages_status();`);
await db.exec(
  readFileSync(
    "supabase/migrations/20260923100000_pillar_body_guard.sql",
    "utf8",
  ),
);

const longBody = `<h2>Guide</h2><p>${"Practical steps for owners. ".repeat(20)}</p>`;
const shortBody = "<p>Short draft stub.</p>";
await db.query(
  "insert into pillar_pages(slug,title,content,status) values ('live','Live',$1,'published'),('draft','Draft',$1,'draft'),('stub','Stub',$2,'published')",
  [longBody, shortBody],
);

// Existing status validation still applies.
await assert.rejects(
  db.query("update pillar_pages set status='archived' where slug='live'"),
  /Invalid status: archived/,
);
await assert.rejects(
  db.query(
    "insert into pillar_pages(slug,title,content,status) values ('bad','Bad','x','junk')",
  ),
  /Invalid status/,
);

// Wiping a published guide is refused, including when unpublishing in the same write.
for (const body of ["<p></p>", "", shortBody, "<p>&nbsp; &nbsp;</p>"]) {
  await assert.rejects(
    db.query("update pillar_pages set content=$1 where slug='live'", [body]),
    /Refusing to empty the body of published topic guide "live"/,
  );
}
await assert.rejects(
  db.query(
    "update pillar_pages set content='<p></p>', status='draft' where slug='live'",
  ),
  /Refusing to empty/,
);
assert.equal(
  (await db.query("select content from pillar_pages where slug='live'")).rows[0]
    .content,
  longBody,
);

// Normal edits, status-only changes, drafts and already-short guides still work.
const edited = longBody.replace("Guide", "Updated guide");
await db.query("update pillar_pages set content=$1 where slug='live'", [
  edited,
]);
await db.query("update pillar_pages set title='Renamed' where slug='live'");
await db.query("update pillar_pages set content='<p></p>' where slug='draft'");
await db.query(
  "update pillar_pages set content='<p>Tiny.</p>' where slug='stub'",
);

// Unpublish first, then the body may be cleared deliberately.
await db.query("update pillar_pages set status='draft' where slug='live'");
await db.query("update pillar_pages set content='<p></p>' where slug='live'");

console.log(
  "PASS: published guide body wipe refused; status check, edits, drafts, stubs and unpublish-then-clear still allowed",
);
await db.close();
