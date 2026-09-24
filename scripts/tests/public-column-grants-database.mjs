import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Mirrors the production shape (columns, Supabase default grants, RLS policies
// and the anon-callable invoker functions) of posts, generated_pages and
// seo_metadata as inspected on 2026-09-23, then applies the column-grant
// migration and proves what anon / authenticated can and cannot read.
const ADMIN = "00000000-0000-0000-0000-000000000001";
const MEMBER = "00000000-0000-0000-0000-000000000002";

const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.is_admin(uuid) returns boolean language sql stable as $$select $1='${ADMIN}'::uuid$$;
grant usage on schema public,auth to anon,authenticated;

create table public.categories(id uuid primary key default gen_random_uuid(),name text,slug text);
create table public.niches(id uuid primary key default gen_random_uuid(),name text,slug text,is_active boolean default true);
create table public.content_schemas(id uuid primary key default gen_random_uuid(),name text,slug text,is_active boolean default true);
create table public.pillar_pages(id uuid primary key default gen_random_uuid(),niche_id uuid,slug text,title text,content text,seo_meta jsonb,status text,published_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());

create table public.posts(
  id uuid primary key default gen_random_uuid(), title text, slug text, content text, excerpt text,
  status text, category_id uuid references public.categories(id), featured_image text, reading_time integer,
  scheduled_at timestamptz, tldr text, key_takeaways jsonb, faq_items jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  lint_flags jsonb, quality_score numeric, publish_override boolean, publish_override_reason text,
  publish_override_at timestamptz, publish_override_by uuid, featured_image_alt text, opportunity_id uuid,
  source_citations jsonb, originality_score integer, freshness_hours integer, performance_grade text,
  embedding text, fact_check jsonb, fact_checked_at timestamptz, published_at timestamptz,
  draft_claim_token uuid, auto_scheduled_at timestamptz, editorial_metadata jsonb);

create table public.generated_pages(
  id uuid primary key default gen_random_uuid(), niche_id uuid references public.niches(id),
  content_schema_id uuid references public.content_schemas(id), slug text, title text, content_json jsonb,
  seo_meta jsonb, schema_markup jsonb, status text, quality_score numeric, generation_model text,
  generation_cost numeric, published_at timestamptz, last_refreshed timestamptz, refresh_count integer,
  performance_trend text, views integer, created_at timestamptz default now(), updated_at timestamptz default now(),
  target_keyword text, keyword_difficulty text, silo_niche_id uuid references public.niches(id), lint_flags jsonb,
  publish_override boolean, publish_override_reason text, publish_override_at timestamptz,
  publish_override_by uuid, human_edited boolean);

create table public.seo_metadata(
  id uuid primary key default gen_random_uuid(), post_id uuid references public.posts(id) on delete cascade,
  meta_title text, meta_description text, keywords text[], og_image text,
  created_at timestamptz default now(), updated_at timestamptz default now());

-- Supabase default privileges: everything to anon and authenticated.
grant all on public.categories,public.niches,public.content_schemas,public.pillar_pages,
  public.posts,public.generated_pages,public.seo_metadata to anon,authenticated;

alter table public.posts enable row level security;
alter table public.generated_pages enable row level security;
alter table public.seo_metadata enable row level security;
create policy "Anyone can read published posts" on public.posts for select using ((status = 'published') or is_admin(auth.uid()));
create policy "Admins can update posts" on public.posts for update to authenticated using (is_admin(auth.uid()));
create policy "Anyone can read published generated_pages" on public.generated_pages for select using ((status = 'published') or is_admin(auth.uid()));
create policy "Admins can update generated_pages" on public.generated_pages for update to authenticated using (is_admin(auth.uid()));
create policy "Admins can view seo" on public.seo_metadata for select to authenticated using (is_admin(auth.uid()));
create policy "Public can read seo for published posts" on public.seo_metadata for select using (
  exists (select 1 from public.posts p where p.id = seo_metadata.post_id and p.status = 'published'));

-- Anon-callable SECURITY INVOKER functions, verbatim from production.
create function public.public_resource_counts() returns table(content_schema_id uuid, page_count bigint)
language sql stable set search_path to 'public' as $$
  SELECT content_schema_id,count(*) FROM public.generated_pages WHERE status='published' GROUP BY content_schema_id $$;
create function public.search_public_library(term text, page integer default 0) returns jsonb
language plpgsql stable set search_path to 'public' as $$
DECLARE result jsonb;
BEGIN
 IF length(term)>200 OR page<0 OR page>10000 THEN RAISE EXCEPTION 'Invalid search'; END IF;
 WITH entries AS (
 SELECT 'article'::text AS kind,title,excerpt AS description,'/blog/'||slug AS path FROM posts WHERE status='published'
 UNION ALL SELECT 'guide',title,seo_meta->>'meta_description','/guides/'||slug FROM pillar_pages WHERE status='published'
 UNION ALL SELECT 'resource',p.title,p.seo_meta->>'meta_description','/resources/'||s.slug||'/'||p.slug FROM generated_pages p JOIN content_schemas s ON s.id=p.content_schema_id WHERE p.status='published' AND s.is_active
 ), matches AS (SELECT * FROM entries WHERE position(lower(trim(term)) in lower(title||' '||coalesce(description,'')))>0), paged AS (SELECT * FROM matches ORDER BY title,path LIMIT 24 OFFSET page*24)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),'items',coalesce((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

insert into public.categories(id,name,slug) values ('10000000-0000-0000-0000-000000000001','Strategy','strategy');
insert into public.niches(id,name,slug) values ('20000000-0000-0000-0000-000000000001','Agencies','agencies');
insert into public.content_schemas(id,name,slug) values ('30000000-0000-0000-0000-000000000001','Ideas','ideas');
insert into public.posts(id,title,slug,content,excerpt,status,category_id,fact_check,embedding,publish_override,publish_override_reason,draft_claim_token,quality_score,editorial_metadata)
values ('40000000-0000-0000-0000-000000000001','Published AI guide','published-ai','<p>Body</p>','Excerpt','published','10000000-0000-0000-0000-000000000001','{"claims":[{"verdict":"unsupported"}]}','[0.1,0.2]',true,'Bulk publish all drafts from admin UI',gen_random_uuid(),42,'{"notes":"private"}'),
       ('40000000-0000-0000-0000-000000000002','Draft AI guide','draft-ai','<p>Draft</p>','Draft','draft',null,'{}','[0.3]',false,null,null,10,'{}');
insert into public.seo_metadata(post_id,meta_title,meta_description,keywords,og_image) values
  ('40000000-0000-0000-0000-000000000001','Meta published','Published description',array['ai'],'https://example.com/og.png'),
  ('40000000-0000-0000-0000-000000000002','Meta draft','Draft description',array['draft'],null);
insert into public.generated_pages(niche_id,content_schema_id,slug,title,content_json,seo_meta,status,generation_cost,generation_model,lint_flags,publish_override_reason,quality_score,target_keyword)
values ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','ai-ideas','AI ideas for agencies','{"intro":"x"}','{"meta_description":"AI ideas"}','published',0.42,'model-x','["thin"]','override',55,'ai ideas'),
       ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','draft-page','Draft page','{}','{}','draft',0.1,'model-x','[]',null,1,'draft');`);

await db.exec(
  readFileSync(
    "supabase/migrations/20260923111000_public_column_grants.sql",
    "utf8",
  ),
);

const POST_PUBLIC =
  "id, title, slug, content, excerpt, status, category_id, featured_image, featured_image_alt, reading_time, tldr, key_takeaways, faq_items, source_citations, published_at, created_at, updated_at";
const PAGE_PUBLIC =
  "id, niche_id, content_schema_id, slug, title, content_json, seo_meta, status, published_at, last_refreshed, created_at, updated_at";
const SEO_PUBLIC =
  "id, post_id, meta_title, meta_description, keywords, og_image, created_at, updated_at";
const denied = /permission denied/;

// ---- anon ---------------------------------------------------------------
await db.exec("reset role; set test.uid=''; set role anon");

const anonPosts = await db.query(
  `select ${POST_PUBLIC} from public.posts order by created_at`,
);
assert.equal(anonPosts.rows.length, 1, "anon sees only published posts");
assert.equal(anonPosts.rows[0].slug, "published-ai");

// Blog card / detail shape with the categories embed PostgREST generates.
const embedded = await db.query(
  `select p.id, p.slug, c.name from public.posts p left join public.categories c on c.id = p.category_id
   where p.status = 'published' order by p.published_at desc nulls last, p.created_at desc`,
);
assert.equal(embedded.rows[0].name, "Strategy");

for (const column of [
  "fact_check",
  "fact_checked_at",
  "embedding",
  "publish_override",
  "publish_override_reason",
  "publish_override_by",
  "draft_claim_token",
  "lint_flags",
  "quality_score",
  "originality_score",
  "editorial_metadata",
  "opportunity_id",
  "performance_grade",
  "freshness_hours",
  "scheduled_at",
  "auto_scheduled_at",
]) {
  await assert.rejects(
    db.query(`select ${column} from public.posts`),
    denied,
    `anon must not read posts.${column}`,
  );
}
await assert.rejects(db.query("select * from public.posts"), denied);
// Filtering on a private column is also a read of that column.
await assert.rejects(
  db.query("select id from public.posts where publish_override = true"),
  denied,
);

const anonPages = await db.query(
  `select ${PAGE_PUBLIC} from public.generated_pages order by title`,
);
assert.equal(anonPages.rows.length, 1, "anon sees only published pages");
const pageJoin = await db.query(
  `select g.slug, n.slug as niche, s.slug as schema from public.generated_pages g
   join public.niches n on n.id = g.niche_id join public.content_schemas s on s.id = g.content_schema_id`,
);
assert.deepEqual(pageJoin.rows[0], {
  slug: "ai-ideas",
  niche: "agencies",
  schema: "ideas",
});
for (const column of [
  "generation_cost",
  "generation_model",
  "quality_score",
  "lint_flags",
  "publish_override",
  "publish_override_reason",
  "publish_override_by",
  "target_keyword",
  "keyword_difficulty",
  "views",
  "refresh_count",
  "performance_trend",
  "human_edited",
  "schema_markup",
  "silo_niche_id",
]) {
  await assert.rejects(
    db.query(`select ${column} from public.generated_pages`),
    denied,
    `anon must not read generated_pages.${column}`,
  );
}
await assert.rejects(db.query("select * from public.generated_pages"), denied);

// The seo_metadata policy subquery reads posts(id, status) as anon.
const anonSeo = await db.query(`select ${SEO_PUBLIC} from public.seo_metadata`);
assert.equal(anonSeo.rows.length, 1, "anon sees SEO only for published posts");
assert.equal(anonSeo.rows[0].meta_title, "Meta published");

// Anon-callable invoker functions still work under column grants.
const counts = await db.query("select * from public.public_resource_counts()");
assert.equal(Number(counts.rows[0].page_count), 1);
const search = await db.query(
  "select public.search_public_library('ai', 0) as r",
);
assert.equal(search.rows[0].r.total, 2, "one article + one resource match");

// Anon never writes these tables; the table-level write privileges are gone.
await assert.rejects(
  db.query("update public.posts set title = 'x'"),
  denied,
  "anon update denied",
);
await assert.rejects(
  db.query("insert into public.generated_pages(title) values ('x')"),
  denied,
  "anon insert denied",
);
await assert.rejects(db.query("truncate public.seo_metadata"), denied);

// ---- authenticated admin ------------------------------------------------
await db.exec(`reset role; set test.uid='${ADMIN}'; set role authenticated`);
const adminPosts = await db.query(
  "select * from public.posts order by created_at",
);
assert.equal(adminPosts.rows.length, 2, "admin reads drafts too");
const published = adminPosts.rows.find((r) => r.slug === "published-ai");
assert.equal(
  published.publish_override_reason,
  "Bulk publish all drafts from admin UI",
);
assert.deepEqual(published.fact_check, {
  claims: [{ verdict: "unsupported" }],
});
assert.equal(published.embedding, "[0.1,0.2]");
const adminPages = await db.query("select * from public.generated_pages");
assert.equal(adminPages.rows.length, 2);
assert.ok(adminPages.rows.every((r) => r.generation_cost !== undefined));
assert.equal(
  (await db.query("select * from public.seo_metadata")).rows.length,
  2,
);
// Admin writes (as authenticated) keep working.
const updated = await db.query(
  "update public.posts set title = 'Renamed' where slug = 'draft-ai' returning id, fact_check",
);
assert.equal(updated.rows.length, 1);

// ---- authenticated non-admin -------------------------------------------
// Documents the residual surface: column access is role-based, so any
// signed-in account keeps full columns on *published* rows (RLS still hides
// drafts). Today every auth user is an admin; see migration header.
await db.exec(`reset role; set test.uid='${MEMBER}'; set role authenticated`);
const memberPosts = await db.query("select slug from public.posts");
assert.equal(memberPosts.rows.length, 1);

console.log(
  "PASS: anon reads public columns of published rows only, private columns denied, policies + invoker RPCs intact, admin full access",
);
await db.close();
