import { useState } from 'react';
import { useStore } from '../lib/store';
import { go } from '../lib/router';
import { NEXT_STATUS, PRIORITY_COLOUR, PRIORITY_LABEL, STATUS_BY_VALUE, WORK_MODES } from '../lib/types';
import { formatDate, formatDateTime, formatSalary, normaliseUrl, relativeDate, relativeInline, todayIso, ukDate } from '../lib/format';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { useStatusChange } from '../components/useStatusChange';
import { toast } from '../components/Toast';
import { Timeline } from '../components/Timeline';
import { FollowUpSheet } from '../components/FollowUpSheet';
import { Avatar, ListRow, Pill, SectionTitle } from '../components/ui';
import { followUpIcs, icsFilename, interviewIcs } from '../lib/ics';
import { openCalendarFile } from '../lib/download';
import { CONFIDENCE_WORDS, StarRating } from '../components/StarRating';

export function JobDetail({ id }: { id: string }) {
  const { jobs, loading, deleteJob, updateJob } = useStore();
  const status = useStatusChange();
  const [showDescription, setShowDescription] = useState(false);
  const [pickFollowUp, setPickFollowUp] = useState(false);
  const job = jobs.find((j) => j.id === id);

  if (!job) {
    return (
      <main className="page">
        <Header title="Job" backTo="/jobs" backLabel="Jobs" />
        <p className="empty muted">{loading ? 'Loading…' : 'This job no longer exists.'}</p>
      </main>
    );
  }

  const next = NEXT_STATUS[job.status];
  const jobUrl = normaliseUrl(job.job_url);
  const appUrl = normaliseUrl(job.application_url);
  const salary = formatSalary(job);
  const terminal = STATUS_BY_VALUE[job.status].terminal;
  const mode = WORK_MODES.find((w) => w.value === job.work_mode);
  const today = todayIso();
  const followOverdue = !terminal && !!job.follow_up_on && job.follow_up_on < today;
  const followToday = !terminal && job.follow_up_on === today;

  async function onDelete() {
    if (!job) return;
    if (!window.confirm(`Delete "${job.role_title}" at ${job.company}? This removes its timeline too.`)) return;
    try {
      await deleteJob(job.id);
      toast('Job deleted');
      go('/jobs', true);
    } catch (e) {
      toast(`Couldn't delete: ${(e as Error).message}`);
    }
  }

  return (
    <main className="page">
      <Header
        title={job.company}
        backTo="/jobs"
        backLabel="Jobs"
        right={
          <a className="btn link" href={`#/jobs/${job.id}/edit`}>
            Edit
          </a>
        }
      />

      <section className="detail-hero">
        <Avatar name={job.company} size={72} />
        <h2 className="detail-role">{job.role_title}</h2>
        <div className="detail-company">{job.company}</div>
        <div className="detail-status-row">
          <StatusBadge status={job.status} long onClick={() => status.open(job)} />
          {job.priority !== 2 && (
            <Pill colour={PRIORITY_COLOUR[job.priority]} icon="flame">
              {PRIORITY_LABEL[job.priority]} priority
            </Pill>
          )}
        </div>
        <div className="hero-confidence">
          <StarRating
            value={job.confidence}
            size={28}
            onChange={(v) =>
              updateJob(job.id, { confidence: v })
                .then(() => toast(v ? `Confidence: ${CONFIDENCE_WORDS[v]}` : 'Confidence cleared'))
                .catch((e: Error) => toast(`Couldn't update: ${e.message}`))
            }
          />
          <span className="muted">{job.confidence ? CONFIDENCE_WORDS[job.confidence] : 'Rate your confidence'}</span>
        </div>
        {next && (
          <button className="btn primary block" onClick={() => void status.change(job, next)}>
            Mark as {STATUS_BY_VALUE[next].label}
            <Icon name="arrow" size={18} stroke={2.4} />
          </button>
        )}
      </section>

      <section className="card">
        <SectionTitle icon="calendar" colour="red">
          Key dates
        </SectionTitle>
        <div className="list">
          <ListRow icon="send" colour="blue" label="Applied">
            {job.applied_on ? <strong>{formatDate(job.applied_on)}</strong> : '—'}
          </ListRow>
          <ListRow icon="bell" colour="orange" label="Follow up">
            <span className="kv-actions">
              <button className="btn link inline" onClick={() => setPickFollowUp(true)}>
                {job.follow_up_on ? (
                  <span className={followOverdue ? 'overdue' : followToday ? 'due' : ''}>{relativeDate(job.follow_up_on)}</span>
                ) : (
                  'Set'
                )}
              </button>
              {job.follow_up_on && (
                <button
                  className="icon-btn small"
                  aria-label="Add follow-up to calendar"
                  onClick={() => openCalendarFile(followUpIcs(job), icsFilename('follow-up', job))}
                >
                  <Icon name="calendarPlus" size={19} />
                </button>
              )}
            </span>
          </ListRow>
          <ListRow icon="calendar" colour="purple" label="Interview">
            {job.interview_at ? (
              <span className="kv-actions">
                <strong>{formatDateTime(job.interview_at)}</strong>
                <button
                  className="icon-btn small"
                  aria-label="Add interview to calendar"
                  onClick={() => openCalendarFile(interviewIcs(job), icsFilename('interview', job))}
                >
                  <Icon name="calendarPlus" size={19} />
                </button>
              </span>
            ) : (
              <a className="btn link inline" href={`#/jobs/${job.id}/edit`}>
                Set
              </a>
            )}
          </ListRow>
          <ListRow icon="clock" colour="pink" label="Closes">
            {job.closing_date ? (
              <strong className={job.closing_date < today ? 'muted' : ''}>
                {job.closing_date < today ? `Closed ${formatDate(job.closing_date)}` : relativeDate(job.closing_date)}
              </strong>
            ) : (
              '—'
            )}
          </ListRow>
        </div>
      </section>

      {(jobUrl || appUrl) && (
        <section className="link-buttons">
          {jobUrl && (
            <a className="btn tinted c-blue block" href={jobUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={18} /> Job ad
            </a>
          )}
          {appUrl && (
            <a className="btn tinted c-indigo block" href={appUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="link" size={18} /> Application
            </a>
          )}
        </section>
      )}

      <section className="card">
        <SectionTitle icon="briefcase" colour="indigo">
          Details
        </SectionTitle>
        <div className="list">
          {job.location && (
            <ListRow icon="mapPin" colour="teal" label="Location">
              <strong>{job.location}</strong>
            </ListRow>
          )}
          {mode && (
            <ListRow icon={mode.icon} colour="indigo" label="Working">
              <strong>{mode.label}</strong>
            </ListRow>
          )}
          {salary && (
            <ListRow icon="pound" colour="green" label="Salary">
              <strong>{salary}</strong>
            </ListRow>
          )}
          {job.source && (
            <ListRow icon="globe" colour="gray" label="Source">
              {job.source}
            </ListRow>
          )}
          {job.cv_version && (
            <ListRow icon="file" colour="brown" label="CV used">
              {job.cv_version}
            </ListRow>
          )}
          {job.cover_letter_version && (
            <ListRow icon="mail" colour="mint" label="Cover letter">
              {job.cover_letter_version}
            </ListRow>
          )}
          <ListRow icon="plus" colour="gray" label="Added">
            {formatDate(ukDate(job.created_at))}
          </ListRow>
        </div>
      </section>

      {(job.contact_name || job.contact_email) && (
        <section className="card">
          <SectionTitle icon="user" colour="pink">
            Contact
          </SectionTitle>
          <div className="list">
            {job.contact_name && (
              <ListRow icon="user" colour="pink" label="Name">
                <strong>{job.contact_name}</strong>
              </ListRow>
            )}
            {job.contact_email && (
              <ListRow icon="mail" colour="blue" label="Email" href={`mailto:${job.contact_email}`} chevron>
                {job.contact_email}
              </ListRow>
            )}
          </div>
        </section>
      )}

      {job.notes && (
        <section className="card">
          <SectionTitle icon="note" colour="yellow">
            Notes
          </SectionTitle>
          <p className="prewrap">{job.notes}</p>
        </section>
      )}

      {job.description && (
        <section className="card">
          <button className="toggle-title" onClick={() => setShowDescription((v) => !v)} aria-expanded={showDescription}>
            <SectionTitle icon="file" colour="gray">
              Job description
            </SectionTitle>
            <span className="btn link inline">{showDescription ? 'Hide' : 'Show'}</span>
          </button>
          {showDescription && <p className="prewrap description">{job.description}</p>}
        </section>
      )}

      <Timeline job={job} />

      <section className="danger-zone">
        <button className="btn danger block" onClick={() => void onDelete()}>
          <Icon name="trash" size={18} /> Delete job
        </button>
      </section>

      {status.sheet}
      {pickFollowUp && (
        <FollowUpSheet
          title={`Follow up with ${job.company}`}
          current={job.follow_up_on}
          onClose={() => setPickFollowUp(false)}
          onPick={(date) => {
            setPickFollowUp(false);
            updateJob(job.id, { follow_up_on: date })
              .then(() => toast(date ? `Follow-up set for ${relativeInline(date)}` : 'Follow-up cleared'))
              .catch((e: Error) => toast(`Couldn't update: ${e.message}`));
          }}
        />
      )}
    </main>
  );
}
