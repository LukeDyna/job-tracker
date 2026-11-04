import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { STATUS_BY_VALUE, type Job } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icon';
import { toast } from './Toast';
import { SectionTitle } from './ui';

const QUICK_NOTES = ['Emailed recruiter', 'Phone screen', 'Chased', 'Sent thank-you'];

export function Timeline({ job }: { job: Job }) {
  const { events, addNote, deleteEvent } = useStore();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const items = events.filter((e) => e.job_id === job.id);

  async function submit(e?: FormEvent, text = note) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addNote(job.id, text);
      setNote('');
    } catch (err) {
      toast(`Couldn't add note: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteEvent(id);
    } catch (err) {
      toast(`Couldn't delete: ${(err as Error).message}`);
    }
  }

  return (
    <section className="card">
      <SectionTitle icon="clock" colour="indigo">Activity</SectionTitle>
      <form className="note-form" onSubmit={submit}>
        <textarea
          rows={2}
          placeholder="Add a note, e.g. phone screen went well"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="New note"
        />
        <button className="btn primary" disabled={busy || !note.trim()}>
          Add
        </button>
      </form>
      {!note && (
        <div className="quick-notes">
          {QUICK_NOTES.map((q) => (
            <button key={q} type="button" className="chip" disabled={busy} onClick={() => void submit(undefined, q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      <ol className="timeline">
        {items.map((e) => (
          <li key={e.id} className={`tl-item tl-${e.kind}`}>
            <span className={`tl-dot c-${e.kind === 'note' ? 'yellow' : STATUS_BY_VALUE[e.to_status!].tone}`} aria-hidden="true">
              <Icon name={e.kind === 'note' ? 'note' : STATUS_BY_VALUE[e.to_status!].icon} size={13} stroke={2.4} />
            </span>
            <div className="tl-body">
              <div className="tl-text">
                {e.kind === 'note' && <span className="prewrap">{e.note}</span>}
                {e.kind === 'created' && (
                  <>
                    Added as <strong>{STATUS_BY_VALUE[e.to_status!].label}</strong>
                  </>
                )}
                {e.kind === 'status_change' && (
                  <>
                    {e.from_status ? STATUS_BY_VALUE[e.from_status].label : '?'} → <strong>{STATUS_BY_VALUE[e.to_status!].label}</strong>
                  </>
                )}
              </div>
              <div className="tl-when muted">{formatDateTime(e.occurred_at)}</div>
            </div>
            {e.kind === 'note' && (
              <button className="icon-btn small" onClick={() => void remove(e.id)} aria-label="Delete note">
                <Icon name="close" size={16} />
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="muted">No activity yet.</li>}
      </ol>
    </section>
  );
}
