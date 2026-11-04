import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '../lib/download';

// iPhone has no automatic "Install app" prompt, so we show our own when the
// site is opened in a browser rather than from the Home Screen icon.
const DISMISS_KEY = 'job-tracker-install-dismissed';
const SNOOZE_DAYS = 3;

/** Safari proper, not Chrome/Firefox/Edge for iOS or an app's built-in browser. */
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|LinkedInApp|Line\//.test(ua)) return false;
  return /Safari\//.test(ua);
}

function snoozed(): boolean {
  const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() - t < SNOOZE_DAYS * 86_400_000;
}

function ShareIcon() {
  return (
    <svg className="share-glyph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Short delay so it doesn't fight the page for attention on first paint.
    const t = setTimeout(() => setShow(isIOS() && !isStandalone() && !snoozed()), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('#')[0]);
      setCopied(true);
    } catch {
      /* clipboard blocked: the instructions still work */
    }
  };

  const safari = isIOSSafari();

  return (
    <div className="install-prompt" role="dialog" aria-label="Install Job Tracker">
      <div className="install-head">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="install-icon" />
        <div className="grow">
          <strong>Install Job Tracker</strong>
          <span className="muted block">Add it to your Home Screen for one-tap access and reminders.</span>
        </div>
        <button className="icon-btn small" onClick={dismiss} aria-label="Not now">
          ✕
        </button>
      </div>

      {safari ? (
        <ol className="install-steps">
          <li>
            Tap <strong>Share</strong> <ShareIcon /> in Safari's toolbar (or <strong>⋯</strong>, then <strong>Share</strong>).
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>, then open <strong>Jobs</strong> from your Home Screen.
          </li>
        </ol>
      ) : (
        <div className="stack">
          <p>
            To install, open this page in <strong>Safari</strong> first.
          </p>
          <button className="btn block" onClick={() => void copyLink()}>
            {copied ? 'Link copied: paste it into Safari' : 'Copy link'}
          </button>
        </div>
      )}

      <button className="btn link" onClick={dismiss}>
        Not now
      </button>
      {safari && <div className="install-arrow" aria-hidden="true" />}
    </div>
  );
}
