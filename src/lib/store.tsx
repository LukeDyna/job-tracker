import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Job, JobEvent, JobInput, JobStatus, JobSuggestion, UserSettings } from './types';

interface Store {
  jobs: Job[];
  events: JobEvent[];
  suggestions: JobSuggestion[];
  settings: UserSettings;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createJob: (input: JobInput) => Promise<Job>;
  updateJob: (id: string, patch: Partial<JobInput>) => Promise<Job>;
  setStatus: (id: string, status: JobStatus) => Promise<Job>;
  deleteJob: (id: string) => Promise<void>;
  addNote: (jobId: string, note: string) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  saveSettings: (patch: Partial<Omit<UserSettings, 'user_id'>>) => Promise<void>;
  saveSuggestion: (s: JobSuggestion) => Promise<Job>;
  dismissSuggestion: (id: string) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

const DEFAULT_SETTINGS = (userId: string): UserSettings => ({
  user_id: userId,
  stale_days: 14,
  search_brief: null,
  search_brief_updated_at: null,
  scout_last_run_at: null,
  scout_last_added: null,
});

function message(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const byOccurredDesc = (a: JobEvent, b: JobEvent) => b.occurred_at.localeCompare(a.occurred_at);

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [suggestions, setSuggestions] = useState<JobSuggestion[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS(userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [jobsRes, eventsRes, suggRes, settingsRes] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('application_events').select('*').order('occurred_at', { ascending: false }),
        supabase.from('job_suggestions').select('*').eq('status', 'new').order('found_at', { ascending: false }),
        supabase.from('user_settings').select('*').maybeSingle(),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (settingsRes.error) throw settingsRes.error;
      setJobs((jobsRes.data ?? []) as Job[]);
      setEvents((eventsRes.data ?? []) as JobEvent[]);
      // Suggestions are optional: don't break the app if that migration isn't applied yet.
      setSuggestions(suggRes.error ? [] : ((suggRes.data ?? []) as JobSuggestion[]));
      setSettings({ ...DEFAULT_SETTINGS(userId), ...((settingsRes.data as UserSettings | null) ?? {}) });
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    // Refresh when the app comes back to the foreground (common on iPhone).
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const replaceJob = (job: Job) => setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);

  /** Status-change events are written by a database trigger, so re-read them for one job. */
  const refreshJobEvents = useCallback(async (jobId: string) => {
    const { data, error } = await supabase
      .from('application_events')
      .select('*')
      .eq('job_id', jobId)
      .order('occurred_at', { ascending: false });
    if (error) return;
    setEvents((prev) => [...prev.filter((e) => e.job_id !== jobId), ...((data ?? []) as JobEvent[])].sort(byOccurredDesc));
  }, []);

  const createJob = useCallback(
    async (input: JobInput) => {
      const { data, error } = await supabase.from('jobs').insert(input).select().single();
      if (error) throw new Error(message(error));
      replaceJob(data as Job);
      void refreshJobEvents((data as Job).id);
      return data as Job;
    },
    [refreshJobEvents],
  );

  const updateJob = useCallback(
    async (id: string, patch: Partial<JobInput>) => {
      const { data, error } = await supabase.from('jobs').update(patch).eq('id', id).select().single();
      if (error) throw new Error(message(error));
      replaceJob(data as Job);
      if ('status' in patch) void refreshJobEvents(id);
      return data as Job;
    },
    [refreshJobEvents],
  );

  const setStatus = useCallback((id: string, status: JobStatus) => updateJob(id, { status }), [updateJob]);

  const deleteJob = useCallback(async (id: string) => {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new Error(message(error));
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setEvents((prev) => prev.filter((e) => e.job_id !== id));
  }, []);

  const addNote = useCallback(async (jobId: string, note: string) => {
    const { data, error } = await supabase
      .from('application_events')
      .insert({ job_id: jobId, kind: 'note', note: note.trim() })
      .select()
      .single();
    if (error) throw new Error(message(error));
    setEvents((prev) => [data as JobEvent, ...prev].sort(byOccurredDesc));
    // The note bumps last_activity_at on the job (trigger); pick that up.
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
    if (job) replaceJob(job as Job);
  }, []);

  const deleteEvent = useCallback(async (eventId: string) => {
    const { error } = await supabase.from('application_events').delete().eq('id', eventId);
    if (error) throw new Error(message(error));
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<Omit<UserSettings, 'user_id'>>) => {
      const next = { ...settingsRef.current, ...patch, user_id: userId };
      const { data, error } = await supabase.from('user_settings').upsert(next).select().single();
      if (error) throw new Error(message(error));
      setSettings({ ...DEFAULT_SETTINGS(userId), ...(data as UserSettings) });
    },
    [userId],
  );

  const saveSuggestion = useCallback(
    async (s: JobSuggestion) => {
      const notes = [s.match_reason && `Why it matched: ${s.match_reason}`, s.salary_text && `Salary (as advertised): ${s.salary_text}`]
        .filter(Boolean)
        .join('\n');
      const job = await createJob({
        company: s.company,
        role_title: s.role_title,
        status: 'interested',
        job_url: s.url,
        application_url: null,
        location: s.location,
        work_mode: s.work_mode,
        salary_min: s.salary_min,
        salary_max: s.salary_max,
        salary_period: s.salary_period,
        source: s.source ? `${s.source} (job scout)` : 'Job scout',
        closing_date: s.closing_date,
        priority: 2,
        confidence: null,
        contact_name: null,
        contact_email: null,
        cv_version: null,
        cover_letter_version: null,
        description: s.summary,
        notes: notes || null,
        applied_on: null,
        follow_up_on: null,
        interview_at: null,
      });
      await supabase.from('job_suggestions').update({ status: 'saved', job_id: job.id }).eq('id', s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      return job;
    },
    [createJob],
  );

  const dismissSuggestion = useCallback(async (id: string) => {
    const { error } = await supabase.from('job_suggestions').update({ status: 'dismissed' }).eq('id', id);
    if (error) throw new Error(message(error));
    setSuggestions((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      jobs,
      events,
      suggestions,
      settings,
      loading,
      error,
      reload,
      createJob,
      updateJob,
      setStatus,
      deleteJob,
      addNote,
      deleteEvent,
      saveSettings,
      saveSuggestion,
      dismissSuggestion,
    }),
    [jobs, events, suggestions, settings, loading, error, reload, createJob, updateJob, setStatus, deleteJob, addNote, deleteEvent, saveSettings, saveSuggestion, dismissSuggestion],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
