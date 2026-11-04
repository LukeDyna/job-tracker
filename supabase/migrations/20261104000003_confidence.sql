-- Job Tracker: confidence rating (1–5 stars) per job.
-- Set any time; she's asked to re-score it when a job is marked "Interviewed"
-- (the 'interviewing' status, now labelled "Interviewed" in the app).

alter table public.jobs
  add column if not exists confidence smallint check (confidence is null or confidence between 1 and 5);
