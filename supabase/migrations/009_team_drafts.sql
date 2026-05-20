-- Cross-device persistence for generated team drafts. Admins compose a draft
-- via AdminTeamBuilder; the JSON blob is mirrored here so a draft created on
-- one device stays visible on another, surviving navigation/refresh until an
-- admin regenerates or publishes.

create table if not exists team_drafts (
  match_date  date primary key,
  draft       jsonb not null,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);

alter table team_drafts enable row level security;

create policy "team_drafts_admin_read" on team_drafts
  for select using (is_admin());

create policy "team_drafts_admin_write" on team_drafts
  for all using (is_admin());

create or replace function set_team_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists team_drafts_updated_at on team_drafts;
create trigger team_drafts_updated_at
before update on team_drafts
for each row execute function set_team_drafts_updated_at();
