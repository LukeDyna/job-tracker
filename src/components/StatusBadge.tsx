import { STATUS_BY_VALUE, type JobStatus } from '../lib/types';
import { Icon } from './Icon';

export function StatusBadge({
  status,
  onClick,
  long = false,
  compact = false,
}: {
  status: JobStatus;
  onClick?: () => void;
  long?: boolean;
  /** Icon only (e.g. inside a list already grouped by stage). */
  compact?: boolean;
}) {
  const meta = STATUS_BY_VALUE[status];
  const text = long ? meta.label : meta.short;
  const content = (
    <>
      <Icon name={meta.icon} size={compact ? 16 : 14} stroke={2.4} />
      {!compact && <span>{text}</span>}
    </>
  );
  if (!onClick) return <span className={`badge c-${meta.tone}`}>{content}</span>;
  return (
    <button
      type="button"
      className={`badge c-${meta.tone} tappable ${compact ? 'compact' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Status: ${meta.label}. Tap to change.`}
      title="Change status"
    >
      {content}
      <Icon name="chevronDown" size={13} stroke={2.6} />
    </button>
  );
}
