import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { eventsCsv, jobsCsv } from '../lib/csv';
import { saveTextFile } from '../lib/download';
import { formatDateTime, todayIso } from '../lib/format';
import { Header } from '../components/Header';
import { toast } from '../components/Toast';
import { InstallCard } from '../components/InstallCard';
import { ListRow, Pill, SectionTitle } from '../components/ui';

const BRIEF_PLACEHOLDER =
  "e.g. I'm looking for marketing or communications roles, ideally content or social media, at mid level (around £28–35k). " +
  "Cardiff or within 30 minutes, hybrid or remote is great. I'd love charities, education or the arts; I'd rather avoid sales targets and call centres. " +
  'Full time or 4 days a week.';

export function Settings({ email }: { email: string }) {
  const { settings, saveSettings, jobs, events } = useStore();
  const [staleDays, setStaleDays] = useState(String(settings.stale_days));
  const [brief, setBrief] = useState(settings.search_brief ?? '');
  const [saving, setSaving] = useState<'stale' | 'brief' | null>(null);

  async function saveStale() {
    const n = Number(staleDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast('Enter a number of days between 1 and 365');
      return;
    }
    setSaving('stale');
    try {
      await saveSettings({ stale_days: n });
      toast('Saved');
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  async function saveBrief() {
    setSaving('brief');
    try {
      const text = brief.trim();
      await saveSettings({ search_brief: text || null, search_brief_updated_at: new Date().toISOString() });
      toast(text ? 'Saved. The next daily search will use this.' : 'Daily search turned off');
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  async function exportJobs() {
    await saveTextFile(jobsCsv(jobs), `job-tracker-jobs-${todayIso()}.csv`, 'text/csv');
  }
  async function exportTimeline() {
    await saveTextFile(eventsCsv(events, jobs), `job-tracker-activity-${todayIso()}.csv`, 'text/csv');
  }

  async function signOut() {
    if (!window.confirm('Sign out? You will need a new email code to sign back in.')) return;
    await supabase.auth.signOut();
  }

  const briefChanged = brief.trim() !== (settings.search_brief ?? '').trim();

  return (
    <main className="page">
      <Header title="Settings" large />

      <section className="card stack">
        <SectionTitle icon="sparkle" colour="purple">
          Daily job search
        </SectionTitle>
        <p className="hint">
          Describe the jobs you want in your own words: role types, level, salary, where, working pattern, sectors you
          like or want to avoid. Each morning a search looks for new matching jobs online and puts them in Ideas.
          Clear the box to turn it off.
        </p>
        <textarea
          rows={7}
          value={brief}
          maxLength={4000}
          placeholder={BRIEF_PLACEHOLDER}
          onChange={(e) => setBrief(e.target.value)}
          aria-label="Search brief"
        />
        <div className="row-between">
          <span className="pills">
            {settings.scout_last_run_at ? (
              <Pill colour="purple" icon="clock">
                Last search {formatDateTime(settings.scout_last_run_at)}
              </Pill>
            ) : (
              <Pill colour="gray" icon="clock">
                Not run yet
              </Pill>
            )}
          </span>
          <button className="btn primary" onClick={() => void saveBrief()} disabled={saving === 'brief' || !briefChanged}>
            {saving === 'brief' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section className="card stack">
        <SectionTitle icon="bell" colour="orange">
          Reminders
        </SectionTitle>
        <label className="field">
          <span>Flag applications with no reply after (days)</span>
          <div className="inline-input">
            <input
              inputMode="numeric"
              value={staleDays}
              onChange={(e) => setStaleDays(e.target.value.replace(/[^\d]/g, ''))}
              aria-label="Days without activity"
            />
            <button
              className="btn tinted c-orange"
              onClick={() => void saveStale()}
              disabled={saving === 'stale' || staleDays === String(settings.stale_days)}
            >
              Save
            </button>
          </div>
        </label>
      </section>

      <InstallCard />

      <section className="card">
        <SectionTitle icon="download" colour="green">
          Backup
        </SectionTitle>
        <div className="list">
          <ListRow icon="briefcase" colour="indigo" label="Export jobs (CSV)" onClick={jobs.length ? () => void exportJobs() : undefined} chevron={jobs.length > 0}>
            {jobs.length}
          </ListRow>
          <ListRow icon="clock" colour="teal" label="Export activity (CSV)" onClick={events.length ? () => void exportTimeline() : undefined} chevron={events.length > 0}>
            {events.length}
          </ListRow>
        </div>
      </section>

      <section className="card">
        <SectionTitle icon="user" colour="gray">
          Account
        </SectionTitle>
        <div className="list">
          <ListRow icon="mail" colour="blue" label="Signed in as">
            {email}
          </ListRow>
          <ListRow icon="logout" colour="red" label="Sign out" onClick={() => void signOut()} chevron />
        </div>
      </section>

      <p className="footnote muted">Job Tracker v{__APP_VERSION__}</p>
    </main>
  );
}
