-- Calendar feeds are polled, not pushed. Every 30 minutes is a reasonable
-- balance: fresh enough that the strip reflects a meeting moved this morning,
-- infrequent enough to stay well inside the free tier.
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

  perform extensions.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.invoke_calendar_sync() from public, anon, authenticated;

select cron.schedule(
  'calendar-sync-half-hourly',
  '*/30 * * * *',
  $$select public.invoke_calendar_sync();$$
);
