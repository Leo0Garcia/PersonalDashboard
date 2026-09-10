-- The upsert target must be a plain unique index. A PARTIAL unique index
-- cannot be inferred by ON CONFLICT through PostgREST, which has no way to
-- express the index predicate, so every sync write failed with 42P10.
--
-- Dropping the predicate is safe: Postgres treats NULLs as distinct in a
-- unique index by default, so manually-created events (subscription_id and
-- external_id both NULL) are still unconstrained and can coexist freely.
drop index if exists public.calendar_events_external_idx;

create unique index calendar_events_external_idx
  on public.calendar_events (subscription_id, external_id);
