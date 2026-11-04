import { addDays, todayIso, ukDate } from './format';
import { STATUS_BY_VALUE, type Job, type JobEvent } from './types';

export interface Attention {
  followUps: Job[]; // follow-up date today or earlier
  interviews: Job[]; // interview from 2 hours ago up to 14 days ahead
  closingSoon: Job[]; // still "Interested", closes within 3 days
  stale: Job[]; // "Applied", no activity for N days, no follow-up planned
}

const isOpen = (j: Job) => !STATUS_BY_VALUE[j.status].terminal;

export function needsAttention(jobs: Job[], staleDays: number, now = new Date()): Attention {
  const today = todayIso();
  const in3 = addDays(today, 3);
  const staleBefore = now.getTime() - staleDays * 86_400_000;
  const interviewFrom = now.getTime() - 2 * 3_600_000;
  const interviewTo = now.getTime() + 14 * 86_400_000;

  const followUps = jobs
    .filter((j) => isOpen(j) && j.follow_up_on && j.follow_up_on <= today)
    .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!));

  const interviews = jobs
    .filter((j) => {
      if (!j.interview_at || !isOpen(j)) return false;
      const t = new Date(j.interview_at).getTime();
      return t >= interviewFrom && t <= interviewTo;
    })
    .sort((a, b) => a.interview_at!.localeCompare(b.interview_at!));

  const closingSoon = jobs
    .filter((j) => j.status === 'interested' && j.closing_date && j.closing_date >= today && j.closing_date <= in3)
    .sort((a, b) => a.closing_date!.localeCompare(b.closing_date!));

  const stale = jobs
    .filter(
      (j) =>
        j.status === 'applied' &&
        !j.follow_up_on &&
        new Date(j.last_activity_at).getTime() < staleBefore,
    )
    .sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at));

  return { followUps, interviews, closingSoon, stale };
}

export function attentionCount(a: Attention): number {
  return a.followUps.length + a.interviews.length + a.closingSoon.length + a.stale.length;
}

export function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const RESPONSE_STATUSES = new Set(['interview_invited', 'interviewing', 'offer', 'accepted', 'rejected']);
const INTERVIEW_STATUSES = new Set(['interview_invited', 'interviewing', 'offer', 'accepted']);

export interface Stats {
  appliedThisWeek: number;
  appliedThisMonth: number;
  appliedTotal: number;
  responseRate: number | null; // 0..1, null when nothing applied yet
  responded: number;
  interviews: number;
  offers: number;
  active: number;
}

/** Monday of the current UK week as yyyy-mm-dd. */
function weekStart(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(today, -dow);
}

export function computeStats(jobs: Job[], events: JobEvent[]): Stats {
  const today = todayIso();
  const monday = weekStart(today);
  const monthStart = `${today.slice(0, 7)}-01`;

  // Statuses each job has ever reached (from the timeline), plus its current one.
  const reached = new Map<string, Set<string>>();
  for (const j of jobs) reached.set(j.id, new Set([j.status]));
  for (const e of events) if (e.to_status) reached.get(e.job_id)?.add(e.to_status);

  const applied = jobs.filter((j) => j.applied_on);
  const countable = applied.filter((j) => j.status !== 'withdrawn' || [...reached.get(j.id)!].some((s) => RESPONSE_STATUSES.has(s)));
  const responded = countable.filter((j) => [...reached.get(j.id)!].some((s) => RESPONSE_STATUSES.has(s))).length;

  return {
    appliedThisWeek: applied.filter((j) => j.applied_on! >= monday).length,
    appliedThisMonth: applied.filter((j) => j.applied_on! >= monthStart).length,
    appliedTotal: applied.length,
    responseRate: countable.length ? responded / countable.length : null,
    responded,
    interviews: jobs.filter((j) => [...reached.get(j.id)!].some((s) => INTERVIEW_STATUSES.has(s))).length,
    offers: jobs.filter((j) => reached.get(j.id)!.has('offer') || j.status === 'accepted').length,
    active: jobs.filter((j) => isOpen(j)).length,
  };
}

/** Interview time label, e.g. "Today 14:30" or "Thu 6 Nov, 10:00". */
export function interviewWhen(ts: string): { day: string; time: string } {
  const day = ukDate(ts);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(ts));
  return { day, time };
}
