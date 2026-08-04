-- Enforce name/surname non-null on profiles so a stub bot / seed row can't
-- silently ship a null and take down UIs that (reasonably) call .trim() on
-- the string.
--
-- Trigger: the 1 Aug 2026 Admin-tab blank-screen. A Rossini bot profile got
-- seeded with surname=null; AdminCsvImport.tsx:37 called `.trim()` on it and
-- the whole Admin route crashed for every admin. The Rossini row is now
-- surname='', but a schema-level guarantee is cheaper than remembering.
--
-- Defaults are '' (empty string) rather than 'Bot' or similar — leaves the
-- naming choice to whoever creates the row and only stops the null.

-- Backfill safety net (idempotent) so the NOT NULL never fails on legacy rows.
update public.profiles set name    = '' where name    is null;
update public.profiles set surname = '' where surname is null;

alter table public.profiles
  alter column name    set default '',
  alter column surname set default '',
  alter column name    set not null,
  alter column surname set not null;
