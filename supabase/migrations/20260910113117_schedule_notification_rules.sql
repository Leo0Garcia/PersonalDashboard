-- ============================================================
-- Hourly notification rules run.
--
-- Vercel Hobby caps cron at once per day, UTC only, which cannot serve a
-- morning digest AND an evening nudge. pg_cron is free on all Supabase plans
-- and takes arbitrary schedules, so scheduling lives here instead.
--
-- The job fires HOURLY and the edge function decides who is due, by comparing
-- each user's local wall-clock hour (from profiles.timezone) against their
-- preference. A job pinned to a fixed UTC hour would silently drift by an hour
-- across the GMT/BST boundary.
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Reads the service role key from Vault so it is never written into a job
-- definition or a migration file in plain text.
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

  perform extensions.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_notification_rules() from public, anon, authenticated;

select cron.schedule(
  'notification-rules-hourly',
  '0 * * * *',
  $$select public.invoke_notification_rules();$$
);
