import { useEffect, useState, type FormEvent } from 'react';
import { addDays, fromLocalInput, toLocalInput, todayIso } from '../lib/format';
import type { Job } from '../lib/types';

interface Props {
  job: Job;
  onSave: (interviewAt: string | null) => void;
  onClose: () => void;
}

/** Default suggestion: the existing interview time, else tomorrow at 10:00. */
function initialValue(job: Job): { date: string; time: string } {
  if (job.interview_at) {
    const [date, time] = toLocalInput(job.interview_at).split('T');
    return { date, time };
  }
  return { date: addDays(todayIso(), 1), time: '10:00' };
}

/**
 * Shown when a job is marked "Interview invited": asks for the interview
 * date and time. "Not arranged yet" changes the status without a date.
 */
export function InterviewSheet({ job, onSave, onClose }: Props) {
  const [{ date, time }, setValue] = useState(() => initialValue(job));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const at = date && time ? fromLocalInput(`${date}T${time}`) : null;
    if (at) onSave(at);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Interview date and time"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <strong>Interview invited 🎉</strong>
          <span className="muted">
            When is your interview with {job.company}?
          </span>
        </div>
        <div className="sheet-group sheet-fields">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setValue((v) => ({ ...v, date: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Time</span>
            <input
              type="time"
              required
              step={300}
              value={time}
              onChange={(e) => setValue((v) => ({ ...v, time: e.target.value }))}
            />
          </label>
        </div>
        <button className="btn primary block" disabled={!date || !time}>
          Save interview
        </button>
        <button type="button" className="btn block" onClick={() => onSave(null)}>
          Not arranged yet
        </button>
        <button type="button" className="btn link" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
