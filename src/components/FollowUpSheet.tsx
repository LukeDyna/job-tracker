import { useEffect, useState } from 'react';
import { addDays, formatDate, todayIso } from '../lib/format';
import { Tile } from './ui';
import type { Colour } from '../lib/types';

interface Props {
  title: string;
  current: string | null;
  onPick: (date: string | null) => void;
  onClose: () => void;
}

/** Quick follow-up date picker: big presets plus a date field. */
export function FollowUpSheet({ title, current, onPick, onClose }: Props) {
  const [custom, setCustom] = useState(current ?? '');
  const today = todayIso();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  const presets: { label: string; date: string; colour: Colour }[] = [
    { label: 'Tomorrow', date: addDays(today, 1), colour: 'red' },
    { label: 'In 3 days', date: addDays(today, 3), colour: 'orange' },
    { label: 'In a week', date: addDays(today, 7), colour: 'blue' },
    { label: 'In 2 weeks', date: addDays(today, 14), colour: 'indigo' },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">{title}</div>
        <div className="sheet-group">
          {presets.map((p) => (
            <button key={p.label} className="sheet-row" onClick={() => onPick(p.date)}>
              <Tile colour={p.colour} icon="bell" />
              <span className="grow">{p.label}</span>
              <span className="muted">{formatDate(p.date)}</span>
            </button>
          ))}
        </div>
        <div className="sheet-group sheet-custom">
          <input type="date" value={custom} min={today} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a date" />
          <button className="btn primary" disabled={!custom} onClick={() => custom && onPick(custom)}>
            Set
          </button>
        </div>
        {current && (
          <button className="btn danger block" onClick={() => onPick(null)}>
            Clear follow-up
          </button>
        )}
        <button className="btn block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
