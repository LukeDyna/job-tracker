import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { STATUSES, STATUS_BY_VALUE, type Job, type JobStatus, type StatusMeta } from '../lib/types';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { Avatar, Tile } from '../components/ui';
import { JobPills } from '../components/JobPills';
import { StatusBadge } from '../components/StatusBadge';
import { useStatusChange } from '../components/useStatusChange';

type Sort = 'updated' | 'priority' | 'closing' | 'applied' | 'company';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'closing', label: 'Closing date' },
  { value: 'applied', label: 'Date applied' },
  { value: 'company', label: 'Company A–Z' },
];

/** Closed-off stages start folded away so the active pipeline stays in view. */
const COLLAPSED_BY_DEFAULT: JobStatus[] = ['rejected', 'withdrawn', 'no_response'];

const VIEW_KEY = 'job-tracker-list-view-v2';

interface View {
  sort: Sort;
  collapsed: JobStatus[];
}

function loadView(): View {
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? '');
    if (v && typeof v.sort === 'string' && Array.isArray(v.collapsed)) return v;
  } catch {
    /* ignore */
  }
  return { sort: 'updated', collapsed: COLLAPSED_BY_DEFAULT };
}

/** Nulls always sort last. */
function cmpNullable<T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

function sortJobs(jobs: Job[], sort: Sort): Job[] {
  const out = [...jobs];
  const byUpdated = (a: Job, b: Job) => b.updated_at.localeCompare(a.updated_at);
  switch (sort) {
    case 'priority':
      return out.sort((a, b) => a.priority - b.priority || byUpdated(a, b));
    case 'closing':
      return out.sort((a, b) => cmpNullable(a.closing_date, b.closing_date, (x, y) => x.localeCompare(y)) || byUpdated(a, b));
    case 'applied':
      return out.sort((a, b) => cmpNullable(a.applied_on, b.applied_on, (x, y) => y.localeCompare(x)) || byUpdated(a, b));
    case 'company':
      return out.sort((a, b) => a.company.localeCompare(b.company, 'en-GB', { sensitivity: 'base' }));
    default:
      return out.sort(byUpdated);
  }
}

export function JobList() {
  const { jobs, loading, error, reload } = useStore();
  const [view, setViewState] = useState(loadView);
  const [query, setQuery] = useState('');
  const status = useStatusChange();

  const setView = (patch: Partial<View>) => {
    const next = { ...view, ...patch };
    setViewState(next);
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(next));
  };

  const toggle = (s: JobStatus) =>
    setView({ collapsed: view.collapsed.includes(s) ? view.collapsed.filter((x) => x !== s) : [...view.collapsed, s] });

  const activeCount = useMemo(() => jobs.filter((j) => !STATUS_BY_VALUE[j.status].terminal).length, [jobs]);

  // One group per stage, in pipeline order; empty stages are left out.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? jobs.filter((j) =>
          [j.company, j.role_title, j.location, j.source, j.contact_name, j.notes].some((v) => v?.toLowerCase().includes(q)),
        )
      : jobs;
    return STATUSES.map((meta) => ({ meta, jobs: sortJobs(matching.filter((j) => j.status === meta.value), view.sort) })).filter(
      (g) => g.jobs.length > 0,
    );
  }, [jobs, query, view.sort]);

  const searching = query.trim().length > 0;

  return (
    <main className="page">
      <Header title="Jobs" large subtitle={`${activeCount} active · ${jobs.length} in total`} />

      <div className="list-tools">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Search company, role, location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search jobs"
          />
        </label>
        {jobs.length > 0 && (
          <label className="sort">
            <Icon name="list" size={16} />
            <span>Sort by</span>
            <select value={view.sort} onChange={(e) => setView({ sort: e.target.value as Sort })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="banner error">
          {error}{' '}
          <button className="btn link" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="empty muted">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="empty card">
          {jobs.length === 0 ? (
            <>
              <Tile colour="indigo" icon="briefcase" size={56} />
              <p>No jobs yet. Add the first one you're interested in.</p>
              <a className="btn primary" href="#/jobs/new">
                <Icon name="plus" size={18} stroke={2.6} /> Add your first job
              </a>
            </>
          ) : (
            <p className="muted">Nothing matches “{query.trim()}”.</p>
          )}
        </div>
      ) : (
        groups.map(({ meta, jobs: groupJobs }) => {
          // While searching, show every match regardless of folded stages.
          const open = searching || !view.collapsed.includes(meta.value);
          return (
            <section key={meta.value} className="stage-group">
              <StageHeader meta={meta} count={groupJobs.length} open={open} onToggle={searching ? undefined : () => toggle(meta.value)} />
              {open && (
                <ul className="cards">
                  {groupJobs.map((j) => (
                    <li key={j.id}>
                      <JobCard job={j} onStatus={() => status.open(j)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
      {status.sheet}
    </main>
  );
}

function StageHeader({ meta, count, open, onToggle }: { meta: StatusMeta; count: number; open: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      className={`stage-header c-${meta.tone}`}
      onClick={onToggle}
      disabled={!onToggle}
      aria-expanded={open}
    >
      <Tile colour={meta.tone} icon={meta.icon} size={28} />
      <span className="stage-name">{meta.label}</span>
      <span className={`count-pill c-${meta.tone}`}>{count}</span>
      <span className="grow" />
      {onToggle && (
        <span className={`stage-chevron ${open ? 'open' : ''}`}>
          <Icon name="chevron" size={16} stroke={2.4} />
        </span>
      )}
    </button>
  );
}

function JobCard({ job, onStatus }: { job: Job; onStatus: () => void }) {
  return (
    <a className="card job-card" href={`#/jobs/${job.id}`}>
      <div className="job-card-top">
        <Avatar name={job.company} />
        <div className="job-card-titles">
          <div className="job-role">{job.role_title}</div>
          <div className="job-company">{job.company}</div>
        </div>
        <StatusBadge status={job.status} onClick={onStatus} compact />
      </div>
      <JobPills job={job} />
    </a>
  );
}
