import { useEffect, useState, type FormEvent } from 'react';
import type { Job } from '../lib/types';
import { CONFIDENCE_WORDS, StarRating } from './StarRating';
import { Tile } from './ui';

interface Props {
  job: Job;
  onSave: (confidence: number | null, note: string) => void;
  onClose: () => void;
}

/**
 * Shown when a job is marked "Interviewed": re-score confidence now the
 * interview has happened, with an optional note on how it went.
 */
export function ConfidenceSheet({ job, onSave, onClose }: Props) {
  const [stars, setStars] = useState<number | null>(job.confidence);
  const [note, setNote] = useState('');

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
    onSave(stars, note);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="How did the interview go?"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <Tile colour="indigo" icon="chat" size={44} />
          <strong>How did it go?</strong>
          <span className="muted">
            Now you've had the interview with {job.company}, how confident are you about getting the job?
          </span>
        </div>

        <div className="sheet-group confidence-picker">
          <StarRating value={stars} onChange={setStars} size={40} />
          <span className={`confidence-word ${stars ? '' : 'muted'}`}>
            {stars ? CONFIDENCE_WORDS[stars] : 'Tap to rate'}
            {job.confidence && job.confidence !== stars && (
              <span className="muted"> (was {job.confidence}/5)</span>
            )}
          </span>
        </div>

        <textarea
          rows={3}
          placeholder="Notes on how it went (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Notes on how it went"
        />

        <button className="btn primary block">Save</button>
        <button type="button" className="btn block" onClick={() => onSave(job.confidence, '')}>
          Skip for now
        </button>
        <button type="button" className="btn link" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}
