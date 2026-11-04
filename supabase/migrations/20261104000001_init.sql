-- Job Tracker: initial schema
-- Tables: jobs, application_events, user_settings
-- Every table has RLS restricting all operations to user_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.job_status as enum (
  'interested',
  'applied',
  'interview_invited',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
  'no_response'
);

create type public.work_mode as enum ('remote', 'hybrid', 'onsite');

create type public.salary_period as enum ('year', 'day', 'hour');

create type public.event_kind as enum ('created', 'status_change', 'note');

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,

  company               text not null check (length(trim(company)) > 0),
  role_title            text not null check (length(trim(role_title)) > 0),
  status                public.job_status not null default 'interested',

  job_url               text,
  application_url       text,
  location              text,
  work_mode             public.work_mode,
  salary_min            integer check (salary_min is null or salary_min >= 0),
  salary_max            integer check (salary_max is null or salary_max >= 0),
  salary_period         public.salary_period not null default 'year',
  source                text,
  closing_date          date,
  priority              smallint not null default 2 check (priority between 1 and 3),
  contact_name          text,
  contact_email         text,
  cv_version            text,
  cover_letter_version  text,
  description           text,
  notes                 text,

  applied_on            date,
  follow_up_on          date,
  interview_at          timestamptz,

  -- Bumped on every status change and every manual note; drives "stale" detection.
  last_activity_at      timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint salary_range_valid check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  )
);

create index jobs_user_status_idx     on public.jobs (user_id, status);
create index jobs_user_follow_up_idx  on public.jobs (user_id, follow_up_on) where follow_up_on is not null;
create index jobs_user_interview_idx  on public.jobs (user_id, interview_at) where interview_at is not null;
create index jobs_user_closing_idx    on public.jobs (user_id, closing_date) where closing_date is not null;
create index jobs_user_activity_idx   on public.jobs (user_id, last_activity_at);

-- ---------------------------------------------------------------------------
-- application_events (timeline)
-- ---------------------------------------------------------------------------
create table public.application_events (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         public.event_kind not null,
  from_status  public.job_status,
  to_status    public.job_status,
  note         text,
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint note_has_text check (kind <> 'note' or length(trim(coalesce(note, ''))) > 0)
);

create index application_events_job_idx  on public.application_events (job_id, occurred_at desc);
create index application_events_user_idx on public.application_events (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  stale_days  integer not null default 14 check (stale_days between 1 and 365),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- BEFORE INSERT/UPDATE on jobs:
--  * keep updated_at fresh
--  * on a status change, bump last_activity_at
--  * when the job first reaches Applied (or skips straight past it to an
--    interview/offer stage) and applied_on is empty, set applied_on to today
--    (UK date). The user can still edit applied_on afterwards.
create or replace function public.jobs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_changed boolean := tg_op = 'INSERT' or new.status is distinct from old.status;
begin
  new.updated_at := now();

  if status_changed then
    if tg_op = 'UPDATE' then
      new.last_activity_at := now();
    end if;

    if new.applied_on is null
       and new.status in ('applied', 'interview_invited', 'interviewing', 'offer', 'accepted') then
      new.applied_on := (now() at time zone 'Europe/London')::date;
    end if;
  end if;

  return new;
end;
$$;

create trigger jobs_before_write
  before insert or update on public.jobs
  for each row execute function public.jobs_before_write();

-- AFTER INSERT/UPDATE on jobs: log creation and every status change.
create or replace function public.jobs_log_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (job_id, user_id, kind, to_status)
    values (new.id, new.user_id, 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.application_events (job_id, user_id, kind, from_status, to_status)
    values (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  return null;
end;
$$;

create trigger jobs_log_status
  after insert or update of status on public.jobs
  for each row execute function public.jobs_log_status();

-- AFTER INSERT on application_events: a manual note counts as activity.
create or replace function public.events_bump_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'note' then
    update public.jobs
       set last_activity_at = greatest(last_activity_at, new.occurred_at)
     where id = new.job_id;
  end if;
  return null;
end;
$$;

create trigger events_bump_activity
  after insert on public.application_events
  for each row execute function public.events_bump_activity();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_settings_touch
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.jobs               enable row level security;
alter table public.application_events enable row level security;
alter table public.user_settings      enable row level security;

-- jobs
create policy "jobs: select own" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "jobs: insert own" on public.jobs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "jobs: update own" on public.jobs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "jobs: delete own" on public.jobs
  for delete to authenticated using (user_id = (select auth.uid()));

-- application_events (inserts must also point at one of your own jobs)
create policy "events: select own" on public.application_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "events: insert own" on public.application_events
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.user_id = (select auth.uid())
    )
  );
create policy "events: update own" on public.application_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "events: delete own" on public.application_events
  for delete to authenticated using (user_id = (select auth.uid()));

-- user_settings
create policy "settings: select own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: insert own" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "settings: update own" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "settings: delete own" on public.user_settings
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants: only signed-in users reach these tables through the Data API.
-- ---------------------------------------------------------------------------
revoke all on public.jobs, public.application_events, public.user_settings from anon;
grant select, insert, update, delete
  on public.jobs, public.application_events, public.user_settings
  to authenticated;
