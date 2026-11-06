import type { IconName } from '../components/Icon';

export type JobStatus =
  | 'interested'
  | 'applied'
  | 'interview_invited'
  | 'interviewing'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'no_response';

export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type SalaryPeriod = 'year' | 'day' | 'hour';
export type EventKind = 'created' | 'status_change' | 'note';

export interface Job {
  id: string;
  user_id: string;
  company: string;
  role_title: string;
  status: JobStatus;
  job_url: string | null;
  application_url: string | null;
  location: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod;
  source: string | null;
  closing_date: string | null; // yyyy-mm-dd
  priority: 1 | 2 | 3;
  /** 1–5 stars: how likely she thinks she is to get it. */
  confidence: number | null;
  contact_name: string | null;
  contact_email: string | null;
  cv_version: string | null;
  cover_letter_version: string | null;
  description: string | null;
  notes: string | null;
  applied_on: string | null; // yyyy-mm-dd
  follow_up_on: string | null; // yyyy-mm-dd
  interview_at: string | null; // ISO timestamp
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

/** Fields the user edits (server fills the rest). */
export type JobInput = Omit<Job, 'id' | 'user_id' | 'last_activity_at' | 'created_at' | 'updated_at'>;

export interface JobEvent {
  id: string;
  job_id: string;
  user_id: string;
  kind: EventKind;
  from_status: JobStatus | null;
  to_status: JobStatus | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  stale_days: number;
  search_brief: string | null;
  search_brief_updated_at: string | null;
  scout_last_run_at: string | null;
  scout_last_added: number | null;
  digest_last_sent_on?: string | null;
}

export type SuggestionStatus = 'new' | 'saved' | 'dismissed';

export interface JobSuggestion {
  id: string;
  user_id: string;
  status: SuggestionStatus;
  company: string;
  role_title: string;
  url: string;
  location: string | null;
  work_mode: WorkMode | null;
  salary_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod;
  source: string | null;
  posted_on: string | null;
  closing_date: string | null;
  summary: string | null;
  match_reason: string | null;
  match_score: number | null;
  job_id: string | null;
  found_at: string;
}

/** iOS system colour names; see styles.css (.c-<colour>). */
export type Colour =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'indigo'
  | 'teal'
  | 'pink'
  | 'yellow'
  | 'mint'
  | 'brown'
  | 'gray';

export interface StatusMeta {
  value: JobStatus;
  label: string;
  short: string;
  terminal: boolean;
  tone: Colour;
  icon: IconName;
}

export const STATUSES: StatusMeta[] = [
  { value: 'interested', label: 'Interested', short: 'Interested', terminal: false, tone: 'teal', icon: 'bookmark' },
  { value: 'applied', label: 'Applied', short: 'Applied', terminal: false, tone: 'blue', icon: 'send' },
  { value: 'interview_invited', label: 'Interview invited', short: 'Invited', terminal: false, tone: 'purple', icon: 'calendar' },
  // Stored as 'interviewing'; shown as "Interviewed" (the interview has happened).
  { value: 'interviewing', label: 'Interviewed', short: 'Interviewed', terminal: false, tone: 'indigo', icon: 'chat' },
  { value: 'offer', label: 'Offer', short: 'Offer', terminal: false, tone: 'orange', icon: 'award' },
  { value: 'accepted', label: 'Accepted', short: 'Accepted', terminal: true, tone: 'green', icon: 'checkCircle' },
  { value: 'rejected', label: 'Rejected', short: 'Rejected', terminal: true, tone: 'red', icon: 'xCircle' },
  { value: 'withdrawn', label: 'Withdrawn', short: 'Withdrawn', terminal: true, tone: 'gray', icon: 'undo' },
  { value: 'no_response', label: 'No response (ghosted)', short: 'No response', terminal: true, tone: 'brown', icon: 'hourglass' },
];

export const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s])) as Record<
  JobStatus,
  StatusMeta
>;

/** The obvious "next step" for the quick-advance button. */
export const NEXT_STATUS: Partial<Record<JobStatus, JobStatus>> = {
  interested: 'applied',
  applied: 'interview_invited',
  interview_invited: 'interviewing',
  interviewing: 'offer',
  offer: 'accepted',
};

export const WORK_MODES: { value: WorkMode; label: string; icon: IconName }[] = [
  { value: 'remote', label: 'Remote', icon: 'laptop' },
  { value: 'hybrid', label: 'Hybrid', icon: 'hybrid' },
  { value: 'onsite', label: 'On-site', icon: 'building' },
];

export const PRIORITY_COLOUR: Record<1 | 2 | 3, Colour> = { 1: 'red', 2: 'orange', 3: 'gray' };

export const SOURCES = [
  'LinkedIn',
  'Indeed',
  'Reed',
  'Totaljobs',
  'Glassdoor',
  'Company website',
  'Recruiter',
  'Referral',
  'Other',
];

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

export function emptyJob(): JobInput {
  return {
    company: '',
    role_title: '',
    status: 'interested',
    job_url: null,
    application_url: null,
    location: null,
    work_mode: null,
    salary_min: null,
    salary_max: null,
    salary_period: 'year',
    source: null,
    closing_date: null,
    priority: 2,
    confidence: null,
    contact_name: null,
    contact_email: null,
    cv_version: null,
    cover_letter_version: null,
    description: null,
    notes: null,
    applied_on: null,
    follow_up_on: null,
    interview_at: null,
  };
}
