import type { Job, JobEvent } from './types';
import { STATUS_BY_VALUE } from './types';

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Neutralise spreadsheet formulas in user text (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens it as UTF-8 (£ signs etc.).
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const JOB_COLUMNS: (keyof Job)[] = [
  'id',
  'company',
  'role_title',
  'status',
  'priority',
  'confidence',
  'location',
  'work_mode',
  'salary_min',
  'salary_max',
  'salary_period',
  'source',
  'job_url',
  'application_url',
  'closing_date',
  'applied_on',
  'follow_up_on',
  'interview_at',
  'contact_name',
  'contact_email',
  'cv_version',
  'cover_letter_version',
  'notes',
  'description',
  'last_activity_at',
  'created_at',
  'updated_at',
];

export function jobsCsv(jobs: Job[]): string {
  return toCsv(
    JOB_COLUMNS as string[],
    jobs.map((j) => JOB_COLUMNS.map((k) => (k === 'status' ? STATUS_BY_VALUE[j.status].label : j[k]))),
  );
}

export function eventsCsv(events: JobEvent[], jobs: Job[]): string {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return toCsv(
    ['occurred_at', 'job_id', 'company', 'role_title', 'kind', 'from_status', 'to_status', 'note'],
    [...events]
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((e) => [
        e.occurred_at,
        e.job_id,
        byId.get(e.job_id)?.company,
        byId.get(e.job_id)?.role_title,
        e.kind,
        e.from_status ? STATUS_BY_VALUE[e.from_status].label : '',
        e.to_status ? STATUS_BY_VALUE[e.to_status].label : '',
        e.note,
      ]),
  );
}
