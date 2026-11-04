const STAR = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z';

export const CONFIDENCE_WORDS: Record<number, string> = {
  1: 'Unlikely',
  2: 'Doubtful',
  3: 'Possible',
  4: 'Hopeful',
  5: 'Very confident',
};

function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`star ${filled ? 'on' : ''}`}>
      <path d={STAR} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

/** Tappable 1–5 stars. Tapping the current value clears it. */
export function StarRating({
  value,
  onChange,
  size = 30,
  label = 'Confidence',
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  size?: number;
  label?: string;
}) {
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}: ${CONFIDENCE_WORDS[n]}`}
          className="star-btn"
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star filled={!!value && n <= value} size={size} />
        </button>
      ))}
    </div>
  );
}

/** Read-only stars, e.g. on a job card. */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="stars-static" aria-label={`Confidence ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} size={size} />
      ))}
    </span>
  );
}
