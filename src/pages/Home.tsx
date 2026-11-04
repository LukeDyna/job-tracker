import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { attentionCount, computeStats, daysSince, needsAttention } from '../lib/attention';
import { formatDateTime, relativeInline, todayIso } from '../lib/format';
import { interviewIcs, icsFilename } from '../lib/ics';
import { openCalendarFile } from '../lib/download';
import type { Colour, Job } from '../lib/types';
import { Header } from '../components/Header';
import { Icon, type IconName } from '../components/Icon';
import { FollowUpSheet } from '../components/FollowUpSheet';
import { Avatar, SectionTitle, Tile } from '../components/ui';
import { toast } from '../components/Toast';

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function Home() {
  const { jobs, events, suggestions, settings, loading, error, reload, updateJob, setStatus, addNote } = useStore();
  const [followUpFor, setFollowUpFor] = useState<Job | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const att = useMemo(() => needsAttention(jobs, settings.stale_days), [jobs, settings.stale_days]);
  const stats = useMemo(() => computeStats(jobs, events), [jobs, events]);
  const total = attentionCount(att);
  const today = todayIso();

  async function run(job: Job, fn: () => Promise<unknown>, done: string) {
    setBusyId(job.id);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(`Couldn't update: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  const followedUp = (job: Job) =>
    run(
      job,
      async () => {
        await addNote(job.id, 'Followed up');
        await updateJob(job.id, { follow_up_on: null });
      },
      `${job.company}: follow-up done`,
    );

  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date());
  const subtitle = total ? `${dateLine} · ${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you` : dateLine;

  return (
    <main className="page">
      <Header title={greeting()} subtitle={subtitle} large />

      {error && (
        <div className="banner error">
          {error}{' '}
          <button className="btn link" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <a className="card suggest-banner" href="#/suggestions">
          <Tile colour="purple" icon="sparkle" size={44} />
          <span className="grow">
            <strong>
              {suggestions.length} new job {suggestions.length === 1 ? 'idea' : 'ideas'}
            </strong>
            <span className="muted block">Found by your daily search</span>
          </span>
          <Icon name="chevron" size={18} />
        </a>
      )}

      {loading ? (
        <p className="empty muted">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="card empty">
          <Tile colour="blue" icon="briefcase" size={56} />
          <p>Add the jobs you're interested in and this page will show what needs doing each day.</p>
          <a className="btn primary" href="#/jobs/new">
            <Icon name="plus" size={18} stroke={2.6} /> Add a job
          </a>
        </div>
      ) : total === 0 ? (
        <div className="card all-clear">
          <Tile colour="green" icon="check" size={48} />
          <div>
            <strong>All clear</strong>
            <p className="muted">No follow-ups, interviews or deadlines need you today.</p>
          </div>
        </div>
      ) : null}

      {att.followUps.length > 0 && (
        <Section title="Follow-ups due" icon="bell" colour="orange" count={att.followUps.length}>
          {att.followUps.map((j) => {
            const overdue = j.follow_up_on! < today;
            return (
              <Row
                key={j.id}
                job={j}
                detail={<span className={overdue ? 'overdue' : 'due'}>{overdue ? `Overdue · was ${relativeInline(j.follow_up_on)}` : 'Due today'}</span>}
              >
                <button className="btn small primary" disabled={busyId === j.id} onClick={() => void followedUp(j)}>
                  <Icon name="check" size={15} stroke={2.6} /> Done
                </button>
                <button className="btn small" disabled={busyId === j.id} onClick={() => setFollowUpFor(j)}>
                  <Icon name="clock" size={15} /> Later
                </button>
              </Row>
            );
          })}
        </Section>
      )}

      {att.interviews.length > 0 && (
        <Section title="Upcoming interviews" icon="calendar" colour="purple" count={att.interviews.length}>
          {att.interviews.map((j) => (
            <Row key={j.id} job={j} detail={<strong className="due-purple">{formatDateTime(j.interview_at)}</strong>}>
              <button className="btn small tinted c-purple" onClick={() => openCalendarFile(interviewIcs(j), icsFilename('interview', j))}>
                <Icon name="calendarPlus" size={15} /> Add to Calendar
              </button>
            </Row>
          ))}
        </Section>
      )}

      {att.closingSoon.length > 0 && (
        <Section title="Closing soon" icon="clock" colour="pink" count={att.closingSoon.length}>
          {att.closingSoon.map((j) => (
            <Row key={j.id} job={j} detail={<span className="overdue">Closes {relativeInline(j.closing_date)}</span>}>
              <button
                className="btn small primary"
                disabled={busyId === j.id}
                onClick={() => void run(j, () => setStatus(j.id, 'applied'), `${j.company}: Applied`)}
              >
                <Icon name="send" size={15} /> Mark applied
              </button>
            </Row>
          ))}
        </Section>
      )}

      {att.stale.length > 0 && (
        <Section title={`No reply for ${settings.stale_days}+ days`} icon="hourglass" colour="brown" count={att.stale.length}>
          {att.stale.map((j) => (
            <Row key={j.id} job={j} detail={<span>Quiet for {daysSince(j.last_activity_at)} days</span>}>
              <button className="btn small tinted c-orange" disabled={busyId === j.id} onClick={() => setFollowUpFor(j)}>
                <Icon name="bell" size={15} /> Set follow-up
              </button>
              <button
                className="btn small"
                disabled={busyId === j.id}
                onClick={() => void run(j, () => setStatus(j.id, 'no_response'), `${j.company}: No response`)}
              >
                No response
              </button>
            </Row>
          ))}
        </Section>
      )}

      {jobs.length > 0 && (
        <section className="card">
          <SectionTitle icon="chart" colour="indigo">
            Your progress
          </SectionTitle>
          <div className="stats">
            <Stat value={stats.appliedThisWeek} label="Applied this week" icon="send" colour="blue" />
            <Stat value={stats.appliedThisMonth} label="Applied this month" icon="calendar" colour="teal" />
            <Stat
              value={stats.responseRate === null ? '–' : `${Math.round(stats.responseRate * 100)}%`}
              label="Response rate"
              hint={stats.responseRate === null ? undefined : `${stats.responded} of ${stats.appliedTotal} replied`}
              icon="chat"
              colour="orange"
            />
            <Stat value={stats.interviews} label="Interviews secured" icon="award" colour="purple" />
          </div>
          <p className="hint stats-hint">
            {stats.active} active · {stats.appliedTotal} applied in total
            {stats.offers ? ` · ${stats.offers} offer${stats.offers === 1 ? '' : 's'} 🎉` : ''}
          </p>
        </section>
      )}

      {followUpFor && (
        <FollowUpSheet
          title={`Follow up with ${followUpFor.company}`}
          current={followUpFor.follow_up_on}
          onClose={() => setFollowUpFor(null)}
          onPick={(date) => {
            const j = followUpFor;
            setFollowUpFor(null);
            void run(j, () => updateJob(j.id, { follow_up_on: date }), date ? `Follow-up set for ${relativeInline(date)}` : 'Follow-up cleared');
          }}
        />
      )}
    </main>
  );
}

function Section({ title, icon, colour, count, children }: { title: string; icon: IconName; colour: Colour; count: number; children: ReactNode }) {
  return (
    <section className="card">
      <SectionTitle icon={icon} colour={colour} count={count}>
        {title}
      </SectionTitle>
      <ul className="attention-list">{children}</ul>
    </section>
  );
}

function Row({ job, detail, children }: { job: Job; detail: ReactNode; children: ReactNode }) {
  return (
    <li className="attention-row">
      <a href={`#/jobs/${job.id}`} className="attention-link">
        <Avatar name={job.company} size={40} />
        <span className="grow">
          <span className="attention-title">{job.role_title}</span>
          <span className="attention-sub">
            {job.company} · {detail}
          </span>
        </span>
        <span className="row-chevron">
          <Icon name="chevron" size={16} />
        </span>
      </a>
      <div className="attention-actions">{children}</div>
    </li>
  );
}

function Stat({ value, label, hint, icon, colour }: { value: number | string; label: string; hint?: string; icon: IconName; colour: Colour }) {
  return (
    <div className={`stat c-${colour}`}>
      <Icon name={icon} size={22} />
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
