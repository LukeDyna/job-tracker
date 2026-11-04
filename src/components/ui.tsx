import type { ReactNode } from 'react';
import type { Colour } from '../lib/types';
import { Icon, type IconName } from './Icon';

/** Tinted capsule with an optional icon, e.g. location, salary, dates. */
export function Pill({
  colour,
  icon,
  children,
  solid = false,
  title,
}: {
  colour: Colour;
  icon?: IconName;
  children: ReactNode;
  solid?: boolean;
  title?: string;
}) {
  return (
    <span className={`pill c-${colour} ${solid ? 'solid' : ''}`} title={title}>
      {icon && <Icon name={icon} size={13} stroke={2.4} />}
      <span className="pill-text">{children}</span>
    </span>
  );
}

/** Rounded-square colour tile with a white icon, like iOS Settings. */
export function Tile({ colour, icon, size = 30 }: { colour: Colour; icon: IconName; size?: number }) {
  return (
    <span className={`tile c-${colour}`} style={{ width: size, height: size, borderRadius: size * 0.28 }} aria-hidden="true">
      <Icon name={icon} size={Math.round(size * 0.58)} stroke={2.2} />
    </span>
  );
}

const AVATAR_COLOURS: Colour[] = ['blue', 'purple', 'pink', 'orange', 'teal', 'indigo', 'green', 'red', 'mint', 'brown'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  const words = name
    .replace(/\b(ltd|limited|plc|llp|inc|the|and|&)\b\.?/gi, ' ')
    .split(/[\s\-/]+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Company "logo": coloured gradient circle with initials, colour stable per name. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const colour = AVATAR_COLOURS[hash(name.toLowerCase().trim()) % AVATAR_COLOURS.length];
  return (
    <span className={`avatar c-${colour}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** iOS-style grouped list row: tile, label, value, optional trailing control. */
export function ListRow({
  icon,
  colour,
  label,
  children,
  onClick,
  href,
  chevron = false,
}: {
  icon: IconName;
  colour: Colour;
  label: string;
  children?: ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
}) {
  const inner = (
    <>
      <Tile colour={colour} icon={icon} />
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
      {chevron && (
        <span className="row-chevron">
          <Icon name="chevron" size={16} />
        </span>
      )}
    </>
  );
  if (href)
    return (
      <a className="list-row tappable-row" href={href}>
        {inner}
      </a>
    );
  if (onClick)
    return (
      <button type="button" className="list-row tappable-row" onClick={onClick}>
        {inner}
      </button>
    );
  return <div className="list-row">{inner}</div>;
}

export function SectionTitle({ icon, colour, children, count }: { icon: IconName; colour: Colour; children: ReactNode; count?: number }) {
  return (
    <h3 className="section-title">
      <Tile colour={colour} icon={icon} size={26} />
      <span className="grow">{children}</span>
      {count !== undefined && <span className={`count-pill c-${colour}`}>{count}</span>}
    </h3>
  );
}
