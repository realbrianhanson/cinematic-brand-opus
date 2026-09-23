import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const ADMIN = "00000000-0000-0000-0000-00000000a0a0";
const MEMBER = "00000000-0000-0000-0000-00000000b0b0";

const db = new PGlite();
// Production shape (checked 2026-09-23) of the tables this migration touches.
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table public.user_roles(user_id uuid, role text);
insert into public.user_roles values ('${ADMIN}','admin');
create function public.is_admin(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin') $$;
create function public.update_updated_at_column() returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end $$;

create table public.generated_pages(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, title text not null,
  content_json jsonb not null default '{}', status text default 'draft',
  quality_score numeric, publish_override boolean default false,
  published_at timestamptz, updated_at timestamptz default now());
create function public.validate_generated_pages_status() returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.status not in ('draft','review','published','archived') then
    raise exception 'Invalid status: %. Must be draft, review, published, or archived.', NEW.status;
  end if;
  if NEW.status = 'published' and (TG_OP = 'INSERT' or OLD.status is distinct from 'published')
     and coalesce(NEW.publish_override, false) = false then
    if NEW.quality_score is null then
      raise exception 'Cannot publish: quality_score is not set. Score the content first or set publish_override.';
    end if;
    if NEW.quality_score < 75 then
      raise exception 'Cannot publish: quality_score % is below the 75 threshold. Improve the content or set publish_override.', NEW.quality_score;
    end if;
  end if;
  return NEW;
end $$;
create trigger trg_validate_generated_pages_status before insert or update on public.generated_pages
  for each row execute function public.validate_generated_pages_status();
create trigger validate_generated_pages_status_trigger before insert or update on public.generated_pages
  for each row execute function public.validate_generated_pages_status();
create trigger trg_generated_pages_updated_at before update on public.generated_pages
  for each row execute function public.update_updated_at_column();

create table public.indexing_log(id uuid primary key default gen_random_uuid(), page_id uuid, page_url text not null);
alter table public.indexing_log add constraint indexing_log_page_id_fkey foreign key (page_id) references public.generated_pages(id);
create table public.generation_logs(id uuid primary key default gen_random_uuid(), batch_id text, generated_page_id uuid, status text, cost numeric);
alter table public.generation_logs add constraint generation_logs_generated_page_id_fkey foreign key (generated_page_id) references public.generated_pages(id);
create table public.keyword_assignments(id uuid primary key default gen_random_uuid(), page_id uuid references public.generated_pages(id) on delete cascade, primary_keyword text);

create table public.generation_jobs(
  id uuid primary key default gen_random_uuid(), batch_id text not null,
  status text not null default 'pending', total_combinations integer not null default 0,
  completed_count integer not null default 0, success_count integer not null default 0,
  failed_count integer not null default 0, skipped_count integer not null default 0,
  request_payload jsonb not null default '{}', result_summary jsonb, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  serp_snapshot jsonb);
create trigger update_generation_jobs_updated_at before update on public.generation_jobs
  for each row execute function public.update_updated_at_column();
insert into public.generation_jobs(batch_id, status) values ('old-1','completed'),('old-2','completed');

create table public.pillar_pages(
  id uuid primary key default gen_random_uuid(), niche_id uuid,
  slug text unique not null, title text not null, content text not null,
  seo_meta jsonb default '{}', status text default 'draft',
  published_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create function public.validate_pillar_pages_status() returns trigger language plpgsql as $$
begin
  if NEW.status not in ('draft','published') then
    raise exception 'Invalid status: %. Must be draft or published.', NEW.status;
  end if;
  return NEW;
end $$;
create trigger trg_validate_pillar_pages_status before insert or update on public.pillar_pages
  for each row execute function public.validate_pillar_pages_status();

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
`);

const fullGuide = [1, 2, 3, 4, 5]
  .map(
    (n) =>
      `<h2>Section ${n}</h2><p>${"Practical, specific steps owners can take this week. ".repeat(8)}</p>`,
  )
  .join("");
const thinGuide = "<h2>Only</h2><p>A short stub that is not ready yet.</p>";

// A live guide that predates the gate stays editable.
await db.query(
  "insert into pillar_pages(slug,title,content,status) values ('live','Live',$1,'published')",
  [fullGuide],
);

for (const file of [
  "supabase/migrations/20260923100000_pillar_body_guard.sql",
  "supabase/migrations/20260923152000_resources_and_guides.sql",
]) {
  await db.exec(readFileSync(file, "utf8"));
}

const asRole = async (role, uid, fn) => {
  await db.exec(
    `set role ${role}; select set_config('test.uid','${uid ?? ""}',false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('test.uid','',false);");
  }
};

// ─── 1. Deleting a resource keeps its logs ───
const page = (
  await db.query(
    "insert into generated_pages(slug,title,content_json,status,quality_score) values ('p1','P1','{\"intro\":\"x\"}','draft',90) returning id",
  )
).rows[0].id;
await db.query(
  "insert into indexing_log(page_id,page_url) values ($1,'/resources/x/p1')",
  [page],
);
await db.query(
  "insert into generation_logs(batch_id,generated_page_id,status) values ('b1',$1,'success')",
  [page],
);
await db.query(
  "insert into keyword_assignments(page_id,primary_keyword) values ($1,'kw')",
  [page],
);
await asRole("authenticated", ADMIN, () =>
  db.query("delete from generated_pages where id=$1", [page]),
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from indexing_log where page_id is null",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from generation_logs where generated_page_id is null and batch_id='b1'",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select count(*)::int n from keyword_assignments")).rows[0].n,
  0,
);

// ─── 2. Quality score is server-owned ───
const p2 = (
  await db.query(
    "insert into generated_pages(slug,title,content_json,quality_score) values ('p2','P2','{\"intro\":\"a\"}',88) returning id",
  )
).rows[0].id;
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query("update generated_pages set quality_score=99 where id=$1", [p2]),
  ),
  /quality_score is set by the scoring service/,
);
// A status-only change keeps the score.
await asRole("authenticated", ADMIN, () =>
  db.query("update generated_pages set status='review' where id=$1", [p2]),
);
assert.equal(
  Number(
    (
      await db.query("select quality_score from generated_pages where id=$1", [
        p2,
      ])
    ).rows[0].quality_score,
  ),
  88,
);
// A content or title edit clears the stale score, so it cannot be published unscored.
await asRole("authenticated", ADMIN, () =>
  db.query(
    'update generated_pages set content_json=\'{"intro":"b"}\' where id=$1',
    [p2],
  ),
);
assert.equal(
  (
    await db.query("select quality_score from generated_pages where id=$1", [
      p2,
    ])
  ).rows[0].quality_score,
  null,
);
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query("update generated_pages set status='published' where id=$1", [p2]),
  ),
  /quality_score is not set/,
);
// Editing and publishing in one statement is also refused.
await db.query("update generated_pages set quality_score=90 where id=$1", [p2]);
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query(
      "update generated_pages set title='New', status='published' where id=$1",
      [p2],
    ),
  ),
  /quality_score is not set/,
);
// The scoring service (service_role) writes scores; then the admin publishes.
await asRole("service_role", null, () =>
  db.query("update generated_pages set quality_score=91 where id=$1", [p2]),
);
await asRole("authenticated", ADMIN, () =>
  db.query(
    "update generated_pages set status='published', published_at=now() where id=$1",
    [p2],
  ),
);
// Admin inserts never carry a score.
await asRole("authenticated", ADMIN, () =>
  db.query(
    "insert into generated_pages(slug,title,quality_score) values ('p3','P3',100)",
  ),
);
assert.equal(
  (await db.query("select quality_score from generated_pages where slug='p3'"))
    .rows[0].quality_score,
  null,
);

// ─── 3. Published resource URLs are fixed ───
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query("update generated_pages set slug='p2-new' where id=$1", [p2]),
  ),
  /URL of a published resource cannot change/,
);
await asRole("authenticated", ADMIN, () =>
  db.query("update generated_pages set slug='p3-better' where slug='p3'"),
);

// ─── 4. Generation jobs: statuses, one active job, stall detection ───
await assert.rejects(
  db.query("insert into generation_jobs(batch_id,status) values ('x','bogus')"),
  /generation_jobs_status_check/,
);
const job = (
  await db.query(
    "insert into generation_jobs(batch_id,status,total_combinations,completed_count,updated_at,work_queue) values ('j1','running',8,4, now() - interval '45 minutes', '[{\"angle\":\"a\"}]') returning id",
  )
).rows[0].id;
await assert.rejects(
  db.query(
    "insert into generation_jobs(batch_id,status) values ('j2','pending')",
  ),
  /generation_jobs_one_active/,
);
await assert.rejects(
  asRole("authenticated", MEMBER, () =>
    db.query("select public.mark_stalled_generation_jobs(30)"),
  ),
  /Admins only/,
);
await assert.rejects(
  asRole("anon", null, () =>
    db.query("select public.mark_stalled_generation_jobs(30)"),
  ),
  /permission denied/,
);
const marked = await asRole("authenticated", ADMIN, () =>
  db.query("select public.mark_stalled_generation_jobs(30) as n"),
);
assert.equal(marked.rows[0].n, 1);
const stalled = (
  await db.query(
    "select status, error_message from generation_jobs where id=$1",
    [job],
  )
).rows[0];
assert.equal(stalled.status, "stalled");
assert.match(stalled.error_message, /4 of 8 pages/);
// A stalled job no longer blocks a new one; a fresh running job is left alone.
await db.query(
  "insert into generation_jobs(batch_id,status) values ('j3','running')",
);
assert.equal(
  (
    await asRole("service_role", null, () =>
      db.query("select public.mark_stalled_generation_jobs(30) as n"),
    )
  ).rows[0].n,
  0,
);
await db.query(
  "update generation_jobs set status='cancelled' where batch_id='j3'",
);

// ─── 5. Topic guide publish gate ───
await assert.rejects(
  db.query(
    "insert into pillar_pages(slug,title,content,status) values ('thin','Thin',$1,'published')",
    [thinGuide],
  ),
  /Cannot publish topic guide "thin"/,
);
await db.query(
  "insert into pillar_pages(slug,title,content,status) values ('thin','Thin',$1,'draft')",
  [thinGuide],
);
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query("update pillar_pages set status='published' where slug='thin'"),
  ),
  /needs at least 1500/,
);
// A full guide publishes without an override.
await db.query(
  "insert into pillar_pages(slug,title,content,status) values ('full','Full',$1,'draft')",
  [fullGuide],
);
await asRole("authenticated", ADMIN, () =>
  db.query("update pillar_pages set status='published' where slug='full'"),
);
// Existing published guides stay editable, and the body guard still holds.
await db.query("update pillar_pages set title='Live 2' where slug='live'");
await assert.rejects(
  db.query("update pillar_pages set content='<p></p>' where slug='live'"),
  /Refusing to empty the body/,
);
// Override: admin only, with a real reason, and recorded.
const thinId = (await db.query("select id from pillar_pages where slug='thin'"))
  .rows[0].id;
await assert.rejects(
  asRole("authenticated", MEMBER, () =>
    db.query(
      "select * from public.publish_pillar_page_with_override($1,'Launch day promo copy')",
      [thinId],
    ),
  ),
  /Admins only/,
);
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query(
      "select * from public.publish_pillar_page_with_override($1,'short')",
      [thinId],
    ),
  ),
  /at least 10 characters/,
);
await assert.rejects(
  asRole("anon", null, () =>
    db.query(
      "select * from public.publish_pillar_page_with_override($1,'Launch day promo copy')",
      [thinId],
    ),
  ),
  /permission denied/,
);
const published = await asRole("authenticated", ADMIN, () =>
  db.query(
    "select status, published_at from public.publish_pillar_page_with_override($1,'Launch day promo copy',array['thin body'])",
    [thinId],
  ),
);
assert.equal(published.rows[0].status, "published");
assert.ok(published.rows[0].published_at);
const override = (
  await db.query(
    "select reason, issues, overridden_by from pillar_publish_overrides where pillar_id=$1",
    [thinId],
  )
).rows[0];
assert.equal(override.reason, "Launch day promo copy");
assert.deepEqual(override.issues, ["thin body"]);
assert.equal(override.overridden_by, ADMIN);
// The override flag does not leak to later statements in the session.
await db.query(
  "insert into pillar_pages(slug,title,content,status) values ('thin2','Thin2',$1,'draft')",
  [thinGuide],
);
await assert.rejects(
  db.query("update pillar_pages set status='published' where slug='thin2'"),
  /Cannot publish topic guide/,
);
// Overrides are admin-read-only.
await assert.rejects(
  asRole("anon", null, () =>
    db.query("select * from pillar_publish_overrides"),
  ),
  /permission denied/,
);
assert.equal(
  (
    await asRole("authenticated", MEMBER, () =>
      db.query("select count(*)::int n from pillar_publish_overrides"),
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (
    await asRole("authenticated", ADMIN, () =>
      db.query("select count(*)::int n from pillar_publish_overrides"),
    )
  ).rows[0].n,
  1,
);
await assert.rejects(
  asRole("authenticated", ADMIN, () =>
    db.query(
      "insert into pillar_publish_overrides(pillar_id,reason) values ($1,'forged override reason')",
      [thinId],
    ),
  ),
  /permission denied/,
);

console.log("resources-guides-database: all checks passed");
