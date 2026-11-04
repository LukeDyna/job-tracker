import { useState } from 'react';
import { useStore } from '../lib/store';
import { go } from '../lib/router';
import { formatDateTime, relativeInline } from '../lib/format';
import type { Colour, JobSuggestion } from '../lib/types';
import { Avatar, Pill, Tile } from '../components/ui';
import { InfoPills } from '../components/JobPills';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { toast } from '../components/Toast';

export function Suggestions() {
  const { suggestions, settings, loading, saveSuggestion, dismissSuggestion } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const hasBrief = !!settings.search_brief?.trim();

  async function save(s: JobSuggestion) {
    setBusy(s.id);
    try {
      const job = await saveSuggestion(s);
      toast(`Saved: ${s.company}`);
      go(`/jobs/${job.id}`);
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
      setBusy(null);
    }
  }

  async function dismiss(s: JobSuggestion) {
    setBusy(s.id);
    try {
      await dismissSuggestion(s.id);
    } catch (e) {
      toast(`Couldn't dismiss: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const subtitle = settings.scout_last_run_at
    ? `Last search ${formatDateTime(settings.scout_last_run_at)} · ${settings.scout_last_added ?? 0} new`
    : 'Fresh job ideas every morning';

  return (
    <main className="page">
      <Header title="Job ideas" subtitle={subtitle} large right={hasBrief ? <a className="btn link" href="#/settings">Edit brief</a> : undefined} />

      {!hasBrief && (
        <div className="card stack">
          <Tile colour="purple" icon="sparkle" size={52} />
          <strong>Get job ideas every morning</strong>
          <p className="muted">
            Describe the jobs you're looking for in a few sentences. Each morning a search looks for matching roles
            online and puts them here for you to look through.
          </p>
          <a className="btn primary block" href="#/settings">
            <Icon name="edit" size={18} /> Write your search brief
          </a>
        </div>
      )}

      {loading ? (
        <p className="empty muted">Loading…</p>
      ) : suggestions.length === 0 ? (
        hasBrief && (
          <div className="card empty">
            <Tile colour="green" icon="check" size={52} />
            <p className="muted">You're all caught up. New ideas arrive each morning.</p>
          </div>
        )
      ) : (
        <ul className="cards">
          {suggestions.map((s) => (
            <li key={s.id}>
              <SuggestionCard s={s} busy={busy === s.id} onSave={() => void save(s)} onDismiss={() => void dismiss(s)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const MATCH: Record<number, { label: string; colour: Colour }> = {
  5: { label: 'Great match', colour: 'green' },
  4: { label: 'Good match', colour: 'mint' },
  3: { label: 'Possible', colour: 'orange' },
  2: { label: 'Long shot', colour: 'gray' },
  1: { label: 'Long shot', colour: 'gray' },
};

function SuggestionCard({
  s,
  busy,
  onSave,
  onDismiss,
}: {
  s: JobSuggestion;
  busy: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const match = s.match_score ? MATCH[s.match_score] : null;

  return (
    <article className="card suggestion">
      <div className="job-card-top">
        <Avatar name={s.company} />
        <div className="job-card-titles">
          <div className="job-role">{s.role_title}</div>
          <div className="job-company">{s.company}</div>
        </div>
      </div>
      <div className="pills">
        {match && (
          <Pill colour={match.colour} icon="target" solid>
            {match.label}
          </Pill>
        )}
        <InfoPills {...s} />
        {s.posted_on && (
          <Pill colour="blue" icon="sparkle">
            Posted {relativeInline(s.posted_on)}
          </Pill>
        )}
        {s.closing_date && (
          <Pill colour="pink" icon="clock">
            Closes {relativeInline(s.closing_date)}
          </Pill>
        )}
        {s.source && (
          <Pill colour="gray" icon="globe">
            {s.source}
          </Pill>
        )}
      </div>
      {s.match_reason && <p className="match-reason">{s.match_reason}</p>}
      {s.summary && (
        <>
          {open && <p className="prewrap description">{s.summary}</p>}
          <button className="btn link small-link" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide summary' : 'Show summary'}
          </button>
        </>
      )}
      <div className="suggestion-actions">
        <a className="btn tinted c-blue" href={s.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={17} /> Advert
        </a>
        <button className="btn" disabled={busy} onClick={onDismiss}>
          <Icon name="close" size={17} /> Dismiss
        </button>
        <button className="btn primary" disabled={busy} onClick={onSave}>
          <Icon name="bookmark" size={17} /> Save
        </button>
      </div>
    </article>
  );
}
