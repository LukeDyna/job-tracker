-- Job Tracker: daily job-search suggestions
--
-- * user_settings.search_brief: a paragraph she writes in the app describing
--   the jobs she wants. A scheduled "job scout" reads it every morning.
-- * job_suggestions: what the scout found, waiting in her Suggestions inbox
--   until she saves (-> becomes a job) or dismisses it.
-- * scout_keys + scout_get_work() / scout_submit(): the scout authenticates
--   with its own random key (only a SHA-256 hash is stored) and can do
--   exactly two things: read the briefs, and add suggestions. It never gets
--   the Supabase secret key, so web pages it reads can't trick it into
--   touching anything else.

-- ---------------------------------------------------------------------------
-- Search brief + scout status on user_settings
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column search_brief            text check (search_brief is null or length(search_brief) <= 4000),
  add column search_brief_updated_at timestamptz,
  add column scout_last_run_at       timestamptz,
  add column scout_last_added        integer;

-- ---------------------------------------------------------------------------
-- job_suggestions
-- ---------------------------------------------------------------------------
create type public.suggestion_status as enum ('new', 'saved', 'dismissed');

create table public.job_suggestions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  status         public.suggestion_status not null default 'new',

  company        text not null check (length(trim(company)) > 0),
  role_title     text not null check (length(trim(role_title)) > 0),
  url            text not null check (length(trim(url)) > 0),
  location       text,
  work_mode      public.work_mode,
  salary_text    text,
  salary_min     integer check (salary_min is null or salary_min >= 0),
  salary_max     integer check (salary_max is null or salary_max >= 0),
  salary_period  public.salary_period not null default 'year',
  source         text,
  posted_on      date,
  closing_date   date,
  summary        text,
  match_reason   text,
  match_score    smallint check (match_score is null or match_score between 1 and 5),

  -- lower(company) | lower(role) : stops the same job being suggested twice
  dedupe_key     text not null,
  job_id         uuid references public.jobs (id) on delete set null,
  found_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (user_id, dedupe_key)
);

create index job_suggestions_user_status_idx on public.job_suggestions (user_id, status, found_at desc);
create index job_suggestions_user_url_idx    on public.job_suggestions (user_id, url);

create trigger job_suggestions_touch
  before update on public.job_suggestions
  for each row execute function public.touch_updated_at();

alter table public.job_suggestions enable row level security;

-- She can read, update (save/dismiss) and delete her own suggestions.
-- There is deliberately no INSERT policy: only scout_submit() adds them.
create policy "suggestions: select own" on public.job_suggestions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "suggestions: update own" on public.job_suggestions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "suggestions: delete own" on public.job_suggestions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.job_suggestions from anon;
revoke insert on public.job_suggestions from authenticated;
grant select, update, delete on public.job_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- scout_keys: hashes of the scout's access keys. Not reachable via the API.
-- ---------------------------------------------------------------------------
create table public.scout_keys (
  key_hash      bytea primary key,
  label         text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

alter table public.scout_keys enable row level security;
revoke all on public.scout_keys from anon, authenticated;

-- Internal: true if p_key matches a stored hash (and records the use).
create or replace function public.scout_check_key(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scout_keys
     set last_used_at = now()
   where key_hash = pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_key, ''), 'UTF8'));
  return found;
end;
$$;

revoke execute on function public.scout_check_key(text) from public, anon, authenticated;

-- Normalised "company | role" key used for de-duplication.
create or replace function public.suggestion_key(p_company text, p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(p_company, '')), '\s+', ' ', 'g'))
         || ' | ' ||
         lower(regexp_replace(trim(coalesce(p_role, '')), '\s+', ' ', 'g'));
$$;

-- What the scout should search for: every user with a non-empty brief, plus
-- the jobs/suggestions they already have so it can skip duplicates.
create or replace function public.scout_get_work(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.scout_check_key(p_key) then
    raise exception 'invalid scout key' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'brief', s.search_brief,
      'brief_updated_at', s.search_brief_updated_at,
      'last_run_at', s.scout_last_run_at,
      'already_known', (
        select coalesce(jsonb_agg(distinct k.key), '[]'::jsonb)
        from (
          select public.suggestion_key(j.company, j.role_title) as key
            from public.jobs j where j.user_id = s.user_id
          union
          select g.dedupe_key
            from public.job_suggestions g
           where g.user_id = s.user_id and g.found_at > now() - interval '180 days'
        ) k
      )
    ))
    from public.user_settings s
    where length(trim(coalesce(s.search_brief, ''))) > 0
  ), '[]'::jsonb);
end;
$$;

-- Add suggestions for one user. Ignores duplicates (same company + role as an
-- existing job or suggestion, or the same URL). At most 30 items per call.
create or replace function public.scout_submit(p_key text, p_user_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item      jsonb;
  added     integer := 0;
  skipped   integer := 0;
  v_key     text;
  v_url     text;
  v_mode    public.work_mode;
  v_period  public.salary_period;
  v_score   smallint;
begin
  if not public.scout_check_key(p_key) then
    raise exception 'invalid scout key' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.user_settings
     where user_id = p_user_id and length(trim(coalesce(search_brief, ''))) > 0
  ) then
    raise exception 'user has no search brief' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items) limit 30 loop
    v_url := nullif(trim(item ->> 'url'), '');
    v_key := public.suggestion_key(item ->> 'company', item ->> 'role_title');

    if v_url is null
       or v_url !~* '^https?://'
       or nullif(trim(item ->> 'company'), '') is null
       or nullif(trim(item ->> 'role_title'), '') is null
       or exists (select 1 from public.jobs j
                   where j.user_id = p_user_id
                     and (public.suggestion_key(j.company, j.role_title) = v_key
                          or j.job_url = v_url or j.application_url = v_url))
       or exists (select 1 from public.job_suggestions g
                   where g.user_id = p_user_id and (g.dedupe_key = v_key or g.url = v_url))
    then
      skipped := skipped + 1;
      continue;
    end if;

    v_mode := case when item ->> 'work_mode' in ('remote', 'hybrid', 'onsite')
                   then (item ->> 'work_mode')::public.work_mode end;
    v_period := case when item ->> 'salary_period' in ('year', 'day', 'hour')
                     then (item ->> 'salary_period')::public.salary_period else 'year' end;
    v_score := case when (item ->> 'match_score') ~ '^[1-5]$'
                    then (item ->> 'match_score')::smallint end;

    insert into public.job_suggestions (
      user_id, company, role_title, url, location, work_mode,
      salary_text, salary_min, salary_max, salary_period, source,
      posted_on, closing_date, summary, match_reason, match_score, dedupe_key
    ) values (
      p_user_id,
      left(trim(item ->> 'company'), 200),
      left(trim(item ->> 'role_title'), 200),
      left(v_url, 2000),
      left(nullif(trim(item ->> 'location'), ''), 200),
      v_mode,
      left(nullif(trim(item ->> 'salary_text'), ''), 200),
      case when (item ->> 'salary_min') ~ '^\d{1,9}$' then (item ->> 'salary_min')::integer end,
      case when (item ->> 'salary_max') ~ '^\d{1,9}$' then (item ->> 'salary_max')::integer end,
      v_period,
      left(nullif(trim(item ->> 'source'), ''), 100),
      case when (item ->> 'posted_on') ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'posted_on')::date end,
      case when (item ->> 'closing_date') ~ '^\d{4}-\d{2}-\d{2}$' then (item ->> 'closing_date')::date end,
      left(nullif(trim(item ->> 'summary'), ''), 2000),
      left(nullif(trim(item ->> 'match_reason'), ''), 1000),
      v_score,
      v_key
    )
    on conflict (user_id, dedupe_key) do nothing;

    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;

  update public.user_settings
     set scout_last_run_at = now(), scout_last_added = added
   where user_id = p_user_id;

  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;

-- The scout calls these with the publishable key (no user session), so anon
-- needs EXECUTE. Both refuse to do anything without a valid scout key.
revoke execute on function public.scout_get_work(text) from public;
revoke execute on function public.scout_submit(text, uuid, jsonb) from public;
grant execute on function public.scout_get_work(text) to anon, authenticated;
grant execute on function public.scout_submit(text, uuid, jsonb) to anon, authenticated;
