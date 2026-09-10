-- These are trigger functions and must never be callable as RPC. Postgres
-- grants EXECUTE to PUBLIC by default, which exposed them at /rest/v1/rpc/*.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.tasks_status_side_effects() from public, anon, authenticated;
