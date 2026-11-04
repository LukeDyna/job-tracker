import { useState } from 'react';
import { useStore } from '../lib/store';
import { formatDateTime } from '../lib/format';
import { STATUS_BY_VALUE, type Job, type JobInput, type JobStatus } from '../lib/types';
import { StatusSheet } from './StatusSheet';
import { InterviewSheet } from './InterviewSheet';
import { ConfidenceSheet } from './ConfidenceSheet';
import { CONFIDENCE_WORDS } from './StarRating';
import { toast } from './Toast';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Shared status-change flow for the list and the detail page. */
export function useStatusChange() {
  const { updateJob, addNote } = useStore();
  const [target, setTarget] = useState<Job | null>(null);
  const [interviewFor, setInterviewFor] = useState<Job | null>(null);
  const [confidenceFor, setConfidenceFor] = useState<Job | null>(null);

  async function apply(job: Job, status: JobStatus, extra: Partial<JobInput> = {}, message?: string) {
    try {
      // One update, so the timeline logs a single status change.
      await updateJob(job.id, { status, ...extra });
      toast(message ?? `${job.company}: ${STATUS_BY_VALUE[status].label}`);
    } catch (e) {
      toast(`Couldn't update: ${(e as Error).message}`);
      throw e;
    }
  }

  async function change(job: Job, status: JobStatus) {
    setTarget(null);
    if (status === job.status) return;
    // Invited to interview: ask when it is.
    if (status === 'interview_invited') {
      setInterviewFor(job);
      return;
    }
    // Interview done: re-score confidence.
    if (status === 'interviewing') {
      setConfidenceFor(job);
      return;
    }
    await apply(job, status).catch(() => {});
  }

  const sheet = (
    <>
      {target && (
        <StatusSheet
          title={`${target.role_title} · ${target.company}`}
          current={target.status}
          onPick={(s) => void change(target, s)}
          onClose={() => setTarget(null)}
        />
      )}
      {interviewFor && (
        <InterviewSheet
          job={interviewFor}
          onClose={() => setInterviewFor(null)}
          onSave={(at) => {
            const job = interviewFor;
            setInterviewFor(null);
            void apply(
              job,
              'interview_invited',
              at ? { interview_at: at } : {},
              at ? `${job.company}: interview ${formatDateTime(at)}` : undefined,
            ).catch(() => {});
          }}
        />
      )}
      {confidenceFor && (
        <ConfidenceSheet
          job={confidenceFor}
          onClose={() => setConfidenceFor(null)}
          onSave={(confidence, note) => {
            const job = confidenceFor;
            setConfidenceFor(null);
            void (async () => {
              await apply(job, 'interviewing', { confidence });
              const rescored = confidence !== null && confidence !== job.confidence;
              const text = [
                rescored ? `After the interview: ${starText(confidence!)} ${CONFIDENCE_WORDS[confidence!]}` : '',
                note.trim(),
              ]
                .filter(Boolean)
                .join('\n');
              if (text) await addNote(job.id, text);
            })().catch(() => {});
          }}
        />
      )}
    </>
  );

  return { open: setTarget, change, sheet };
}
