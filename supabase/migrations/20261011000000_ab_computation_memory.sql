-- Apply to the explicitly chosen AboveBound Supabase project ONLY.
-- Do not apply to unrelated projects (Hexfield or Bb5 without confirmation).
-- Auth: users sign in anonymously; authenticated role is NOT the anon key.
create table if not exists public.ab_computation_memory (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('building','circuits','chemistry')),
  title text not null check(char_length(title) between 1 and 180),
  payload jsonb not null check(jsonb_typeof(payload)='object'
    and length(payload::text) <= 16000),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ab_computation_memory_owner_date_idx
  on public.ab_computation_memory (user_id, saved_at desc);
alter table public.ab_computation_memory enable row level security;
revoke all on public.ab_computation_memory from anon, authenticated;
grant select, insert, update, delete on public.ab_computation_memory to authenticated;

drop policy if exists "ab_user_reads_own" on public.ab_computation_memory;
create policy "ab_user_reads_own" on public.ab_computation_memory
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "ab_user_writes_own" on public.ab_computation_memory;
create policy "ab_user_writes_own" on public.ab_computation_memory
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "ab_user_updates_own" on public.ab_computation_memory;
create policy "ab_user_updates_own" on public.ab_computation_memory
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "ab_user_deletes_own" on public.ab_computation_memory;
create policy "ab_user_deletes_own" on public.ab_computation_memory
  for delete to authenticated
  using ((select auth.uid()) = user_id);
-- Test two distinct authenticated users: user A's token cannot read/write B,
-- and unauthenticated/anon role cannot access any rows.
-- For production, configure anonymous-signin captcha/rate limits, Data API
-- access and backup / retention in the chosen project's dashboard.
