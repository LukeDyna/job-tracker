import { useEffect } from 'react';
import { STATUSES, type JobStatus } from '../lib/types';
import { Icon } from './Icon';
import { Tile } from './ui';

interface Props {
  title: string;
  current: JobStatus;
  onPick: (s: JobStatus) => void;
  onClose: () => void;
}

/** Bottom sheet for picking a status: big rows, reachable with a thumb. */
export function StatusSheet({ title, current, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  const active = STATUSES.filter((s) => !s.terminal || s.value === 'accepted');
  const closed = STATUSES.filter((s) => s.terminal && s.value !== 'accepted');

  const row = (s: (typeof STATUSES)[number]) => (
    <button
      key={s.value}
      className={`sheet-row ${s.value === current ? 'current' : ''}`}
      onClick={() => (s.value === current ? onClose() : onPick(s.value))}
    >
      <Tile colour={s.tone} icon={s.icon} />
      <span className="grow">{s.label}</span>
      {s.value === current && (
        <span className={`sheet-check c-${s.tone}`}>
          <Icon name="check" stroke={2.6} />
        </span>
      )}
    </button>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">{title}</div>
        <div className="sheet-group">{active.map(row)}</div>
        <div className="sheet-group">{closed.map(row)}</div>
        <button className="btn block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
