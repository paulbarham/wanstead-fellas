-- Auto-confirm new sign-ups at the database level, so email+password works
-- without any confirmation email (and regardless of the dashboard toggle).
create or replace function public.autoconfirm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists autoconfirm_before_insert on auth.users;
create trigger autoconfirm_before_insert
  before insert on auth.users
  for each row
  execute function public.autoconfirm_user();
