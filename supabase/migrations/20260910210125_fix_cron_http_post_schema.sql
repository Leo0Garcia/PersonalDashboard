-- pg_net installs its functions into the `net` schema regardless of the
-- CREATE EXTENSION ... WITH SCHEMA clause, so extensions.http_post never
-- existed. Both cron jobs were raising 42883 on every tick and, because
-- pg_cron swallows the error into its run log, failing silently.
create or replace function public.invoke_notification_rules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_url text := 'https://elbocxmdfdjhtbrprmen.supabase.co/functions/v1/run-notification-rules';
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    raise notice 'invoke_notification_rules: vault secret "service_role_key" is missing; skipping run';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

create or replace function public.invoke_calendar_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_url text := 'https://elbocxmdfdjhtbrprmen.supabase.co/functions/v1/sync-calendars';
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_key is null then
    raise notice 'invoke_calendar_sync: vault secret "service_role_key" is missing; skipping run';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.invoke_notification_rules() from public, anon, authenticated;
revoke all on function public.invoke_calendar_sync() from public, anon, authenticated;
