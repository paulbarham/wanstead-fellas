-- MoW push notification triggers.
--
-- Two edges fire mow-notify:
--   * mow_fixtures INSERT (weekly picker landed) → 'mow_published' push
--     to all subscribers, "🎯 This week's MoW: X v Y · kicks off Sat 15:00".
--   * mow_pool_fixtures UPDATE (score just set) → 'mow_result' push, but
--     ONLY if the pool fixture is referenced by a mow_fixtures row (i.e.
--     it's the featured MoW of some week — random Championship result
--     shouldn't ping everyone).
--
-- One-off setup (Vault):
--   mow_notify_url = https://<project-ref>.supabase.co/functions/v1/mow-notify

create or replace function public.call_mow_notify(
  p_mow_fixture_id uuid,
  p_topic text
)
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'mow_notify_url'
  limit 1;

  if v_url is null or v_url = '' then
    raise notice 'vault secret mow_notify_url not set — mow-notify skipped';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('mow_fixture_id', p_mow_fixture_id, 'topic', p_topic),
    timeout_milliseconds := 30000
  );
end;
$$;

-- 1. mow_fixtures INSERT → 'mow_published' push. Guarded by push_sent_at so
--    a manual re-insert / admin override doesn't double-ping the group.
create or replace function public.mow_fixtures_notify_published()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.push_sent_at is null then
    perform public.call_mow_notify(new.id, 'mow_published');
    update public.mow_fixtures set push_sent_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists mow_fixtures_notify_published_trg on public.mow_fixtures;
create trigger mow_fixtures_notify_published_trg
  after insert on public.mow_fixtures
  for each row execute function public.mow_fixtures_notify_published();

-- 2. mow_pool_fixtures score set → look up any mow_fixtures pointing at
--    this pool row, fire 'mow_result' push once per featured MoW. Guarded
--    by mow_fixtures.result_push_sent_at so a score correction doesn't
--    re-ping. Score-clearing (going from set → null) doesn't fire.
create or replace function public.mow_pool_fixtures_notify_result()
returns trigger
language plpgsql
security definer
as $$
declare
  v_mow_id uuid;
begin
  if new.home_score is null or new.away_score is null then
    return new;
  end if;
  if new.home_score is not distinct from old.home_score
     and new.away_score is not distinct from old.away_score then
    return new;
  end if;

  for v_mow_id in
    select id from public.mow_fixtures
    where pool_fixture_id = new.id
      and result_push_sent_at is null
  loop
    perform public.call_mow_notify(v_mow_id, 'mow_result');
    update public.mow_fixtures set result_push_sent_at = now() where id = v_mow_id;
  end loop;

  return new;
end;
$$;
drop trigger if exists mow_pool_fixtures_notify_result_trg on public.mow_pool_fixtures;
create trigger mow_pool_fixtures_notify_result_trg
  after update of home_score, away_score on public.mow_pool_fixtures
  for each row execute function public.mow_pool_fixtures_notify_result();
