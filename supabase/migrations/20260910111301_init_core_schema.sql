-- ============================================================
-- Personal Dashboard — core schema
-- House rules: every table carries user_id, timestamps, RLS
-- deny-by-default with a single auth.uid() = user_id policy.
-- ============================================================

create extension if not exists "pgcrypto";

-- Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------- profiles ----------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/London',
  theme text not null default 'system' check (theme in ('system','light','dark')),
  wip_limit smallint not null default 3 check (wip_limit between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------- tasks ----------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  rank text not null,
  due_at timestamptz,
  priority smallint check (priority between 1 and 3),
  tags text[] not null default '{}',
  focus_position smallint check (focus_position between 1 and 3),
  status_changed_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_status_rank_idx on public.tasks (user_id, status, rank);
create index tasks_user_due_idx on public.tasks (user_id, due_at) where due_at is not null;

-- The design caps Today's Focus at three, positions 1-3, each used once.
-- Enforcing it here means a fourth star is impossible regardless of client bugs.
create unique index tasks_user_focus_position_idx
  on public.tasks (user_id, focus_position)
  where focus_position is not null;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- status_changed_at and completed_at are invariants, not client responsibilities
create or replace function public.tasks_status_side_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_status_side_effects
  before update on public.tasks
  for each row execute function public.tasks_status_side_effects();

-- ---------------- habits ----------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- ISO weekdays the habit is scheduled on: 1 = Monday ... 7 = Sunday
  schedule smallint[] not null default '{1,2,3,4,5,6,7}',
  sort_order integer not null default 0,
  include_in_evening_nudge boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index habits_user_order_idx on public.habits (user_id, sort_order) where archived_at is null;

create trigger habits_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create table public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now()
);

create unique index habit_completions_unique_idx
  on public.habit_completions (habit_id, completed_on);
create index habit_completions_user_date_idx
  on public.habit_completions (user_id, completed_on desc);

-- ---------------- calendar events (read-only display) ----------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  category text not null default 'default',
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);

create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- ---------------- push + notifications ----------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  morning_digest boolean not null default true,
  digest_hour smallint not null default 7 check (digest_hour between 0 and 23),
  digest_minute smallint not null default 0 check (digest_minute in (0, 30)),
  evening_nudge boolean not null default true,
  evening_nudge_hour smallint not null default 22 check (evening_nudge_hour between 0 and 23),
  due_reminders boolean not null default true,
  threshold_alerts boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Dedupe is what stops the hourly rules run from sending 24 digests a day.
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}',
  sent_at timestamptz not null default now()
);

create unique index notification_log_dedupe_idx
  on public.notification_log (user_id, dedupe_key);
create index notification_log_user_sent_idx
  on public.notification_log (user_id, sent_at desc);

-- ---------------- new user bootstrap ----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
