import type { Job } from './types';

const TZ = 'Europe/London';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const dateNoYearFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

/** A yyyy-mm-dd string as a Date at midday UTC (safe from DST/timezone edge shifts). */
function fromIsoDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`);
}

/** Today's date in the UK as yyyy-mm-dd. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/** The UK calendar date (yyyy-mm-dd) of a timestamp. */
export function ukDate(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));
}

export function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today to the given yyyy-mm-dd (negative = in the past). */
export function daysFromToday(iso: string): number {
  return Math.round((fromIsoDate(iso).getTime() - fromIsoDate(todayIso()).getTime()) / 86_400_000);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = fromIsoDate(iso);
  const sameYear = iso.slice(0, 4) === todayIso().slice(0, 4);
  return sameYear ? dateNoYearFmt.format(d) : dateFmt.format(d);
}

/** "Today", "Tomorrow", "Yesterday", "in 4 days", "3 days ago" or a date. */
export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const n = daysFromToday(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 6) return `in ${n} days`;
  if (n < -1 && n >= -6) return `${-n} days ago`;
  return formatDate(iso);
}

/** relativeDate for use mid-sentence: "closes tomorrow", "closes Sat 14 Nov". */
export function relativeInline(iso: string | null | undefined): string {
  const r = relativeDate(iso);
  return /^(Today|Tomorrow|Yesterday)$/.test(r) ? r.toLowerCase() : r;
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '';
  return dateTimeFmt.format(new Date(ts));
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return '';
  return timeFmt.format(new Date(ts));
}

/** ISO timestamp -> value for <input type="datetime-local"> in the device's local time. */
export function toLocalInput(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (device local time) -> ISO timestamp. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatSalary(job: Pick<Job, 'salary_min' | 'salary_max' | 'salary_period'>): string {
  const { salary_min: min, salary_max: max, salary_period: period } = job;
  if (min == null && max == null) return '';
  const suffix = period === 'day' ? ' / day' : period === 'hour' ? ' / hour' : '';
  const fmt = (n: number) => gbp.format(n);
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)}${suffix}`;
  return `${fmt((min ?? max)!)}${suffix}`;
}

/** Make a pasted URL clickable even if the scheme was left off. */
export function normaliseUrl(u: string | null): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
