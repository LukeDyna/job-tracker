import { useEffect, useRef, useState, type ReactNode } from 'react';
import { back } from '../lib/router';
import { Icon } from './Icon';

/**
 * iOS-style navigation bar. With `large`, the page shows a big title that
 * scrolls away; the bar then turns to frosted glass and shows a small title.
 */
export function Header({
  title,
  subtitle,
  large = false,
  backTo,
  backLabel = 'Back',
  right,
}: {
  title: string;
  subtitle?: string;
  large?: boolean;
  /** Show a back button; value is the fallback route if there's no history. */
  backTo?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(!large);

  useEffect(() => {
    if (!large) {
      const onScroll = () => setScrolled(window.scrollY > 4);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [large]);

  return (
    <>
      <header className={`navbar ${scrolled ? 'solid' : ''}`}>
        <div className="nav-side">
          {backTo && (
            <button className="nav-back" onClick={() => back(backTo)} aria-label="Back">
              <Icon name="back" size={26} stroke={2.4} />
              {backLabel}
            </button>
          )}
        </div>
        <div className="nav-title">{(!large || scrolled) && title}</div>
        <div className="nav-side right">{right}</div>
      </header>
      {large && (
        <div className="large-title" ref={titleRef}>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
    </>
  );
}
