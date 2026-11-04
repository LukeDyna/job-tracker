import { formatSalary, relativeInline, todayIso, ukDate } from '../lib/format';
import { STATUS_BY_VALUE, WORK_MODES, type Job, type SalaryPeriod, type WorkMode } from '../lib/types';
import { Pill } from './ui';
import { Stars } from './StarRating';

/** Location / working pattern / salary pills (shared by jobs and suggestions). */
export function InfoPills({
  location,
  work_mode,
  salary_min,
  salary_max,
  salary_period,
  salary_text,
}: {
  location: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod;
  salary_text?: string | null;
}) {
  const salary = formatSalary({ salary_min, salary_max, salary_period }) || salary_text;
  const mode = work_mode && WORK_MODES.find((w) => w.value === work_mode);
  return (
    <>
      {location && (
        <Pill colour="teal" icon="mapPin">
          {location}
        </Pill>
      )}
      {mode && (
        <Pill colour="indigo" icon={mode.icon}>
          {mode.label}
        </Pill>
      )}
      {salary && (
        <Pill colour="green" icon="pound">
          {salary.replace(/£\s?/g, '')}
        </Pill>
      )}
    </>
  );
}

/** Everything worth a glance on a job card. */
export function JobPills({ job, showDates = true }: { job: Job; showDates?: boolean }) {
  const open = !STATUS_BY_VALUE[job.status].terminal;
  const today = todayIso();
  const pills = [];

  if (job.priority === 1) {
    pills.push(
      <Pill key="prio" colour="red" icon="flame">
        High priority
      </Pill>,
    );
  }

  if (showDates && open) {
    if (job.interview_at && ukDate(job.interview_at) >= today) {
      pills.push(
        <Pill key="int" colour="purple" icon="calendar">
          Interview {relativeInline(ukDate(job.interview_at))}
        </Pill>,
      );
    }
    if (job.follow_up_on) {
      const overdue = job.follow_up_on < today;
      pills.push(
        <Pill key="fu" colour={overdue ? 'red' : 'orange'} icon="bell">
          {overdue ? 'Follow-up overdue' : `Follow up ${relativeInline(job.follow_up_on)}`}
        </Pill>,
      );
    }
    if (job.closing_date && job.status === 'interested' && job.closing_date >= today) {
      pills.push(
        <Pill key="cl" colour="pink" icon="clock">
          Closes {relativeInline(job.closing_date)}
        </Pill>,
      );
    }
  }
  if (showDates && job.applied_on && pills.length === 0) {
    pills.push(
      <Pill key="ap" colour="blue" icon="send">
        Applied {relativeInline(job.applied_on)}
      </Pill>,
    );
  }

  if (job.confidence) {
    pills.unshift(
      <Pill key="conf" colour="yellow" title={`Confidence ${job.confidence}/5`}>
        <Stars value={job.confidence} />
      </Pill>,
    );
  }

  const info = InfoPills(job);
  return (
    <div className="pills">
      {pills}
      {info}
    </div>
  );
}
