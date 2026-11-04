import type { Job } from './types';
import { addDays } from './format';

// Minimal RFC 5545 calendar files. Follow-ups are all-day events with a 9am
// reminder; interviews are 1-hour events with reminders the day before and
// an hour before.

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** Fold lines longer than 75 octets (approximated by characters). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (iso: string) => iso.replace(/-/g, '');

function wrap(lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...lines,
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n');
}

function description(job: Job): string {
  const bits = [`${job.role_title} at ${job.company}`];
  if (job.contact_name || job.contact_email) bits.push(`Contact: ${[job.contact_name, job.contact_email].filter(Boolean).join(' ')}`);
  if (job.job_url) bits.push(`Job ad: ${job.job_url}`);
  if (job.application_url) bits.push(`Application: ${job.application_url}`);
  return bits.join('\n');
}

export function followUpIcs(job: Job): string {
  const day = job.follow_up_on!;
  return wrap([
    'BEGIN:VEVENT',
    `UID:followup-${job.id}-${day}@job-tracker`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART;VALUE=DATE:${dateOnly(day)}`,
    `DTEND;VALUE=DATE:${dateOnly(addDays(day, 1))}`,
    `SUMMARY:${esc(`Follow up: ${job.company} (${job.role_title})`)}`,
    `DESCRIPTION:${esc(description(job))}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Follow up with ${job.company}`)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
  ]);
}

export function interviewIcs(job: Job): string {
  const start = new Date(job.interview_at!);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return wrap([
    'BEGIN:VEVENT',
    `UID:interview-${job.id}-${stamp(start)}@job-tracker`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`Interview: ${job.company} (${job.role_title})`)}`,
    `DESCRIPTION:${esc(description(job))}`,
    ...(job.location ? [`LOCATION:${esc(job.location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Interview tomorrow: ${job.company}`)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Interview in 1 hour: ${job.company}`)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
  ]);
}

export function icsFilename(kind: 'follow-up' | 'interview', job: Job): string {
  const slug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'job';
  return `${kind}-${slug}.ics`;
}
