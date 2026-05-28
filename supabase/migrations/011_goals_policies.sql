-- The goals table had RLS enabled but no policies, so every authenticated
-- write failed with "new row violates row-level security policy". Mirror the
-- shape used by fixtures and results: authenticated users can read, admins
-- can do everything.

alter table goals enable row level security;

drop policy if exists goals_select on goals;
create policy goals_select on goals
  for select using (auth.role() = 'authenticated');

drop policy if exists goals_admin_write on goals;
create policy goals_admin_write on goals
  for all using (is_admin());
