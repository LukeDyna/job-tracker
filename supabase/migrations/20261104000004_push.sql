-- Job Tracker phase 4: web push notifications + the daily digest.
--
-- push_subscriptions: one row per device/browser that has turned notifications on.
-- The daily-digest Edge Function reads these with the service role, sends the
-- morning summary, and removes subscriptions the push service says are gone.

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null check (endpoint like 'https://%' and length(endpoint) <= 2000),
  p256dh        text not null check (length(p256dh) between 40 and 200),
  auth          text not null check (length(auth) between 10 and 100),
  device        text check (length(device) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  last_error    text,
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: select own" on public.push_subscriptions;
drop policy if exists "push: insert own" on public.push_subscriptions;
drop policy if exists "push: update own" on public.push_subscriptions;
drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: select own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push: insert own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push: update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "push: delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- When the morning summary last went out (UK date), so a re-run never double-sends.
alter table public.user_settings
  add column if not exists digest_last_sent_on date;

-- Grants. Signed-in users manage their own devices; the Edge Function uses the
-- service role (which bypasses RLS but still needs table privileges).
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select on public.jobs, public.job_suggestions to service_role;
grant select, insert, update on public.user_settings to service_role;
