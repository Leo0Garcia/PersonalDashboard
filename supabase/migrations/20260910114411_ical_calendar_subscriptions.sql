-- ============================================================
-- iCal / Apple Calendar subscriptions.
--
-- Apple's iCloud calendars publish as a public webcal:// URL, and Google
-- exposes a "secret address in iCal format". Both are plain .ics over HTTPS,
-- so one subscription model covers them. The fetch must happen server-side:
-- CORS blocks the browser from reading these URLs directly.
-- ============================================================

create table public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Calendar',
  -- Treat as a credential: anyone holding this URL can read the calendar.
  url text not null,
  colour text not null default 'meeting',
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  last_event_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_subscriptions_user_idx
  on public.calendar_subscriptions (user_id) where enabled;

create trigger calendar_subscriptions_updated_at
  before update on public.calendar_subscriptions
  for each row execute function public.set_updated_at();

alter table public.calendar_subscriptions enable row level security;

create policy "own calendar subscriptions" on public.calendar_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Link events back to their subscription so removing a subscription removes
-- its events, and so a resync can replace just that calendar's rows.
alter table public.calendar_events
  add column subscription_id uuid references public.calendar_subscriptions(id) on delete cascade;

create index calendar_events_subscription_idx
  on public.calendar_events (subscription_id) where subscription_id is not null;

-- Upsert target for sync: one row per (subscription, iCal UID + occurrence).
create unique index calendar_events_external_idx
  on public.calendar_events (subscription_id, external_id)
  where subscription_id is not null and external_id is not null;
