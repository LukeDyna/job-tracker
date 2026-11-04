import { isIOS, isStandalone } from '../lib/download';
import { ListRow, SectionTitle } from './ui';

/**
 * Explains how to install the app on the Home Screen. Push notifications on
 * iPhone only work once it is installed, so this matters.
 */
export function InstallCard() {
  if (isStandalone()) {
    return (
      <section className="card">
        <SectionTitle icon="phone" colour="blue">
          App
        </SectionTitle>
        <div className="list">
          <ListRow icon="check" colour="green" label="Installed on this device" />
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <SectionTitle icon="phone" colour="blue">
        Install the app
      </SectionTitle>
      {isIOS() ? (
        <ol className="install-steps">
          <li>
            Open this page in <strong>Safari</strong>.
          </li>
          <li>
            Tap <strong>Share</strong> (the square with an arrow), or <strong>⋯</strong> then <strong>Share</strong>.
          </li>
          <li>
            Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
          <li>Open Jobs from the new icon and sign in once more.</li>
        </ol>
      ) : (
        <p className="hint">
          On iPhone: open this page in Safari, tap Share → Add to Home Screen. On a Mac, Safari's File → Add to Dock
          or Chrome's install button in the address bar does the same.
        </p>
      )}
    </section>
  );
}
