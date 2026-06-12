-- Switch call_cup_results_sync() to read its URL from Supabase Vault
-- instead of a database-level setting. Database-level settings can't be
-- written by the MCP integration, so this is the more practical store.
-- The vault entry is named 'cup_sync_url' and contains the edge function
-- URL — created once via vault.create_secret(...).

create or replace function call_cup_results_sync()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
begin
  select decrypted_secret
    into v_url
    from vault.decrypted_secrets
   where name = 'cup_sync_url'
   limit 1;
  if v_url is null or v_url = '' then
    raise notice 'vault secret cup_sync_url not set — cup-results-sync skipped';
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;
