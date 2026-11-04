import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { back, go } from '../lib/router';
import {
  PRIORITY_COLOUR,
  PRIORITY_LABEL,
  SOURCES,
  STATUSES,
  WORK_MODES,
  emptyJob,
  type Job,
  type JobInput,
  type JobStatus,
  type SalaryPeriod,
  type WorkMode,
  type Colour,
} from '../lib/types';
import { Icon, type IconName } from '../components/Icon';
import { SectionTitle } from '../components/ui';
import { CONFIDENCE_WORDS, StarRating } from '../components/StarRating';
import { fromLocalInput, toLocalInput } from '../lib/format';
import { Header } from '../components/Header';
import { toast } from '../components/Toast';

const TEXT_FIELDS = [
  'company',
  'role_title',
  'job_url',
  'application_url',
  'location',
  'source',
  'contact_name',
  'contact_email',
  'cv_version',
  'cover_letter_version',
  'description',
  'notes',
] as const;

function fromJob(job: Job): JobInput {
  const { id: _i, user_id: _u, last_activity_at: _l, created_at: _c, updated_at: _up, ...rest } = job;
  return rest;
}

/** Trim text, turn empty strings into nulls. */
function clean(input: JobInput): JobInput {
  const out = { ...input };
  for (const k of TEXT_FIELDS) {
    const v = out[k];
    const t = typeof v === 'string' ? v.trim() : v;
    (out as Record<string, unknown>)[k] = t === '' ? null : t;
  }
  out.company = out.company ?? '';
  out.role_title = out.role_title ?? '';
  return out;
}

export function JobForm({ id }: { id?: string }) {
  const { jobs, createJob, updateJob } = useStore();
  const existing = id ? jobs.find((j) => j.id === id) : undefined;
  const [form, setForm] = useState<JobInput>(() => (existing ? fromJob(existing) : emptyJob()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  if (id && !existing) {
    return (
      <main className="page">
        <Header title="Edit job" backTo="/jobs" />
        <p className="empty muted">Loading…</p>
      </main>
    );
  }

  function set<K extends keyof JobInput>(key: K, value: JobInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  const text = (key: (typeof TEXT_FIELDS)[number]) => ({
    value: (form[key] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
  });

  const num = (key: 'salary_min' | 'salary_max') => ({
    value: form[key] ?? '',
    onChange: (e: { target: { value: string } }) => {
      const digits = e.target.value.replace(/[^\d]/g, '');
      set(key, digits === '' ? null : Number(digits));
    },
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const data = clean(form);
    if (!data.company || !data.role_title) {
      setError('Company and role are required.');
      return;
    }
    if (data.salary_min != null && data.salary_max != null && data.salary_min > data.salary_max) {
      setError('Salary "from" is higher than "to".');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = existing ? await updateJob(existing.id, data) : await createJob(data);
      toast(existing ? 'Saved' : 'Job added');
      // Editing: return to the detail page we came from. Adding: swap the
      // form for the new job's page so Back goes to the list.
      if (existing) back(`/jobs/${saved.id}`);
      else go(`/jobs/${saved.id}`, true);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  function onCancel() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    back(existing ? `/jobs/${existing.id}` : '/jobs');
  }

  return (
    <main className="page form-page">
      <Header
        title={existing ? 'Edit job' : 'Add job'}
        right={
          <button className="btn link" onClick={onCancel} type="button">
            Cancel
          </button>
        }
      />
      <form onSubmit={onSubmit} className="stack" noValidate>
        <Section title="The job" icon="briefcase" colour="blue">
          <Field label="Company *">
            <input {...text('company')} autoCapitalize="words" required />
          </Field>
          <Field label="Role *">
            <input {...text('role_title')} autoCapitalize="words" required />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <div className="segmented" role="radiogroup" aria-label="Priority">
              {([1, 2, 3] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={form.priority === p}
                  className={`c-${PRIORITY_COLOUR[p]} ${form.priority === p ? 'on' : ''}`}
                  onClick={() => set('priority', p)}
                >
                  {p === 1 && <Icon name="flame" size={15} />}
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Confidence" hint="How likely do you think you are to get it?">
            <div className="stars-field">
              <StarRating value={form.confidence} onChange={(v) => set('confidence', v)} />
              <span className="muted">{form.confidence ? CONFIDENCE_WORDS[form.confidence] : 'Not rated'}</span>
            </div>
          </Field>
        </Section>

        <Section title="Links" icon="link" colour="indigo">
          <Field label="Job ad URL">
            <input {...text('job_url')} type="url" inputMode="url" autoCapitalize="none" placeholder="https://" />
          </Field>
          <Field label="Application / portal link">
            <input {...text('application_url')} type="url" inputMode="url" autoCapitalize="none" placeholder="https://" />
          </Field>
        </Section>

        <Section title="Where & pay" icon="mapPin" colour="teal">
          <Field label="Location">
            <input {...text('location')} autoCapitalize="words" />
          </Field>
          <Field label="Working pattern">
            <div className="segmented" role="radiogroup" aria-label="Working pattern">
              {WORK_MODES.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  role="radio"
                  aria-checked={form.work_mode === w.value}
                  className={`c-indigo ${form.work_mode === w.value ? 'on' : ''}`}
                  onClick={() => set('work_mode', form.work_mode === w.value ? null : (w.value as WorkMode))}
                >
                  <Icon name={w.icon} size={16} />
                  {w.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="field-row">
            <Field label="Salary from (£)">
              <input {...num('salary_min')} inputMode="numeric" placeholder="e.g. 32000" />
            </Field>
            <Field label="to (£)">
              <input {...num('salary_max')} inputMode="numeric" placeholder="e.g. 38000" />
            </Field>
          </div>
          <Field label="Salary is per">
            <select value={form.salary_period} onChange={(e) => set('salary_period', e.target.value as SalaryPeriod)}>
              <option value="year">Year</option>
              <option value="day">Day</option>
              <option value="hour">Hour</option>
            </select>
          </Field>
          <Field label="Source">
            <input {...text('source')} list="sources" autoCapitalize="words" placeholder="LinkedIn, Indeed, referral…" />
            <datalist id="sources">
              {SOURCES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </Section>

        <Section title="Dates" icon="calendar" colour="red">
          <Field label="Closing date">
            <input type="date" value={form.closing_date ?? ''} onChange={(e) => set('closing_date', e.target.value || null)} />
          </Field>
          <Field label="Applied on" hint="Filled in automatically when you mark it Applied.">
            <input type="date" value={form.applied_on ?? ''} onChange={(e) => set('applied_on', e.target.value || null)} />
          </Field>
          <Field label="Next follow-up">
            <input type="date" value={form.follow_up_on ?? ''} onChange={(e) => set('follow_up_on', e.target.value || null)} />
          </Field>
          <Field label="Interview date & time">
            <input
              type="datetime-local"
              value={toLocalInput(form.interview_at)}
              onChange={(e) => set('interview_at', fromLocalInput(e.target.value))}
            />
          </Field>
        </Section>

        <Section title="Contact" icon="user" colour="pink">
          <Field label="Name">
            <input {...text('contact_name')} autoCapitalize="words" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input {...text('contact_email')} type="email" inputMode="email" autoCapitalize="none" autoComplete="off" />
          </Field>
        </Section>

        <Section title="What you sent" icon="file" colour="brown">
          <Field label="CV version">
            <input {...text('cv_version')} placeholder="e.g. CV v3 (marketing)" />
          </Field>
          <Field label="Cover letter version">
            <input {...text('cover_letter_version')} />
          </Field>
        </Section>

        <Section title="Job description" icon="file" colour="gray" hint="Paste the ad text: listings disappear once they close.">
          <textarea {...text('description')} rows={8} aria-label="Job description" />
        </Section>

        <Section title="Notes" icon="note" colour="yellow">
          <textarea {...text('notes')} rows={4} aria-label="Notes" />
        </Section>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button className="btn primary block" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add job'}
          </button>
        </div>
      </form>
    </main>
  );
}

function Section({
  title,
  icon,
  colour,
  hint,
  children,
}: {
  title: string;
  icon: IconName;
  colour: Colour;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="card form-section">
      <legend>
        <SectionTitle icon={icon} colour={colour}>
          {title}
        </SectionTitle>
      </legend>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}
