// Job Tracker: daily-digest Edge Function (Supabase / Deno).
//
// Two ways in:
//   1. The scheduled GitHub Action (header `x-digest-secret`), body {"mode":"digest","force":false}:
//      sends each user her morning summary, once per UK day, between 08:00 and 12:00 UK time.
//   2. The app's "Send a test" button (the signed-in user's own access token), body
//      {"mode":"test","endpoint":"<this device>"}: sends today's summary to that device now.
//
// Web Push (RFC 8291 aes128gcm encryption + RFC 8292 VAPID) is done with Web Crypto, so the
// function has no dependencies and can be pasted into the dashboard editor as one file.
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, DIGEST_SECRET.
// SUPABASE_URL and the service key are provided by Supabase automatically.
// Deploy with "Verify JWT" OFF: the function checks the secret / user token itself.

type Env = { get(name: string): string | undefined };
type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Bytes helpers
// ---------------------------------------------------------------------------

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

export interface Vapid {
  publicKey: string; // base64url, 65-byte uncompressed P-256 point
  privateKey: string; // base64url, 32-byte scalar
  subject: string; // https://… or mailto:…
}

export async function vapidAuthHeader(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not a P-256 public key');
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${vapid.publicKey}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** RFC 8291: encrypt a push message for one subscription (single aes128gcm record). */
export async function encryptPayload(plaintext: Uint8Array, p256dh: string, authSecret: string): Promise<Bytes> {
  const uaPublic = b64urlDecode(p256dh);
  const auth = b64urlDecode(authSecret);
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256),
  );

  const ikm = await hkdf(auth, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Payload followed by the 0x02 "last record" delimiter, no extra padding.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushResult {
  ok: boolean;
  gone: boolean; // the browser unsubscribed: delete the row
  status: number;
  error?: string;
}

export async function sendPush(sub: Subscription, message: unknown, vapid: Vapid): Promise<PushResult> {
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthHeader(sub.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '43200', // keep trying for 12 hours if the phone is offline
        Urgency: 'normal',
        Topic: 'daily-digest', // a newer summary replaces an undelivered one
      },
      body,
    });
    if (res.ok) return { ok: true, gone: false, status: res.status };
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: `${res.status} ${text}`.trim() };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------

export interface DigestJob {
  id: string;
  user_id: string;
  company: string;
  role_title: string;
  status: string;
  follow_up_on: string | null;
  interview_at: string | null;
  closing_date: string | null;
  last_activity_at: string;
}

export interface DigestMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
  badge: number;
}

const TZ = 'Europe/London';
const OPEN_STATUSES = ['interested', 'applied', 'interview_invited', 'interviewing', 'offer'];

/** UK calendar date (yyyy-mm-dd) and hour for an instant. */
export function ukNow(d: Date): { date: string; hour: number; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), time: `${p.hour}:${p.minute}` };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'today';
  if (iso === addDays(today, 1)) return 'tomorrow';
  if (iso === addDays(today, -1)) return 'yesterday';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function names(jobs: DigestJob[], max = 2): string {
  const shown = jobs.slice(0, max).map((j) => j.company);
  const more = jobs.length - shown.length;
  return more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(shown.length === 2 ? ' and ' : ', ');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Build one user's morning summary, or null when there is nothing to say. */
export function buildDigest(jobs: DigestJob[], staleDays: number, newIdeas: number, now: Date): DigestMessage | null {
  const { date: today } = ukNow(now);
  const tomorrow = addDays(today, 1);
  const open = jobs.filter((j) => OPEN_STATUSES.includes(j.status));

  const interviews = open
    .filter((j) => {
      if (!j.interview_at) return false;
      const t = new Date(j.interview_at);
      const day = ukNow(t).date;
      return (day === today || day === tomorrow) && t.getTime() >= now.getTime() - 2 * 3_600_000;
    })
    .sort((a, b) => a.interview_at!.localeCompare(b.interview_at!));

  const followUps = open
    .filter((j) => j.follow_up_on && j.follow_up_on <= today)
    .sort((a, b) => a.follow_up_on!.localeCompare(b.follow_up_on!));

  const closing = open
    .filter((j) => j.status === 'interested' && j.closing_date && j.closing_date >= today && j.closing_date <= addDays(today, 3))
    .sort((a, b) => a.closing_date!.localeCompare(b.closing_date!));

  const staleBefore = now.getTime() - staleDays * 86_400_000;
  const stale = open.filter(
    (j) => j.status === 'applied' && !j.follow_up_on && new Date(j.last_activity_at).getTime() < staleBefore,
  );

  const lines: string[] = [];
  for (const j of interviews.slice(0, 3)) {
    const t = new Date(j.interview_at!);
    lines.push(`🗓️ Interview ${dayLabel(ukNow(t).date, today)} at ${ukNow(t).time} · ${j.company}`);
  }
  if (followUps.length) {
    const overdue = followUps.filter((j) => j.follow_up_on! < today).length;
    lines.push(`🔔 Follow up with ${names(followUps)}${overdue ? ` (${overdue} overdue)` : ''}`);
  }
  if (closing.length === 1) {
    lines.push(`⏳ ${closing[0].company} closes ${dayLabel(closing[0].closing_date!, today)}: apply soon`);
  } else if (closing.length > 1) {
    lines.push(`⏳ ${plural(closing.length, 'saved job')} closing soon: ${names(closing)}`);
  }
  if (stale.length) {
    lines.push(`💤 ${plural(stale.length, 'application')} with no reply for ${staleDays}+ days`);
  }
  if (newIdeas > 0) lines.push(`✨ ${plural(newIdeas, 'new job idea')} to look at`);

  const actions = interviews.length + followUps.length + closing.length + stale.length;
  if (!lines.length) return null;

  const title =
    interviews.some((j) => ukNow(new Date(j.interview_at!)).date === today)
      ? 'Good morning! Interview today 🍀'
      : actions > 0
        ? `Good morning! ${plural(actions, 'thing')} to look at`
        : `Good morning! ${plural(newIdeas, 'new job idea')}`;

  return {
    title,
    body: lines.join('\n'),
    url: actions > 0 ? '#/' : '#/suggestions',
    tag: 'daily-digest',
    badge: actions + newIdeas,
  };
}

// ---------------------------------------------------------------------------
// Supabase REST (service role)
// ---------------------------------------------------------------------------

interface Config {
  url: string;
  serviceKey: string;
  publicKey: string; // for /auth/v1/user
  vapid: Vapid;
  digestSecret: string;
}

function readConfig(env: Env): { config?: Config; missing: string[] } {
  let serviceKey = '';
  try {
    // Newer projects: {"default":"sb_secret_…"}; older: SUPABASE_SERVICE_ROLE_KEY (a JWT).
    const keys = JSON.parse(env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    serviceKey = keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    /* ignore */
  }
  serviceKey ||= env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  let publicKey = '';
  try {
    const keys = JSON.parse(env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>;
    publicKey = keys.default ?? Object.values(keys)[0] ?? '';
  } catch {
    /* ignore */
  }
  publicKey ||= env.get('SUPABASE_ANON_KEY') ?? serviceKey;

  const values = {
    SUPABASE_URL: env.get('SUPABASE_URL') ?? '',
    'service key': serviceKey,
    VAPID_PUBLIC_KEY: env.get('VAPID_PUBLIC_KEY') ?? '',
    VAPID_PRIVATE_KEY: env.get('VAPID_PRIVATE_KEY') ?? '',
    VAPID_SUBJECT: env.get('VAPID_SUBJECT') ?? '',
    DIGEST_SECRET: env.get('DIGEST_SECRET') ?? '',
  };
  const missing = Object.entries(values)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return { missing };
  return {
    missing,
    config: {
      url: values.SUPABASE_URL.replace(/\/$/, ''),
      serviceKey,
      publicKey,
      vapid: { publicKey: values.VAPID_PUBLIC_KEY, privateKey: values.VAPID_PRIVATE_KEY, subject: values.VAPID_SUBJECT },
      digestSecret: values.DIGEST_SECRET,
    },
  };
}

function keyHeaders(key: string): Record<string, string> {
  // sb_secret_/sb_publishable_ keys go in `apikey` only; legacy JWT keys also as a bearer token.
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

async function rest<T>(cfg: Config, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...keyHeaders(cfg.serviceKey), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const inList = (ids: string[]) => `in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`;

async function userFromToken(cfg: Config, token: string): Promise<string | null> {
  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.publicKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-digest-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Summary {
  ukTime: string;
  mode: string;
  users: number;
  sent: number;
  failed: number;
  removed: number;
  nothingToSay: number;
  alreadySent: number;
  errors: string[];
}

async function runDigest(
  cfg: Config,
  opts: { userId?: string; endpoint?: string; force: boolean; markSent: boolean },
  now: Date,
  summary: Summary,
): Promise<void> {
  const today = ukNow(now).date;

  let subQuery = 'push_subscriptions?select=id,user_id,endpoint,p256dh,auth';
  if (opts.userId) subQuery += `&user_id=eq.${opts.userId}`;
  let subs = await rest<Subscription[]>(cfg, subQuery);
  if (opts.endpoint) subs = subs.filter((s) => s.endpoint === opts.endpoint);
  const userIds = [...new Set(subs.map((s) => s.user_id))];
  summary.users = userIds.length;
  if (!userIds.length) return;

  const [settings, jobs, ideas] = await Promise.all([
    rest<{ user_id: string; stale_days: number; digest_last_sent_on: string | null }[]>(
      cfg,
      `user_settings?select=user_id,stale_days,digest_last_sent_on&user_id=${inList(userIds)}`,
    ),
    rest<DigestJob[]>(
      cfg,
      `jobs?select=id,user_id,company,role_title,status,follow_up_on,interview_at,closing_date,last_activity_at` +
        `&user_id=${inList(userIds)}&status=in.(${OPEN_STATUSES.join(',')})`,
    ),
    rest<{ user_id: string }[]>(cfg, `job_suggestions?select=user_id&status=eq.new&user_id=${inList(userIds)}`),
  ]);

  for (const userId of userIds) {
    const s = settings.find((x) => x.user_id === userId);
    if (!opts.force && s?.digest_last_sent_on === today) {
      summary.alreadySent++;
      continue;
    }
    const message =
      buildDigest(
        jobs.filter((j) => j.user_id === userId),
        s?.stale_days ?? 14,
        ideas.filter((i) => i.user_id === userId).length,
        now,
      ) ??
      (opts.markSent
        ? null
        : {
            title: 'Notifications are on 🎉',
            body: "Nothing needs doing today. On busier days you'll get a summary like this at 8am.",
            url: '#/',
            tag: 'daily-digest',
            badge: 0,
          });

    let delivered = 0;
    let failedHere = 0;
    if (message) {
      for (const sub of subs.filter((x) => x.user_id === userId)) {
        const r = await sendPush(sub, message, cfg.vapid);
        if (r.ok) {
          delivered++;
          summary.sent++;
          await rest(cfg, `push_subscriptions?id=eq.${sub.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ last_sent_at: new Date().toISOString(), last_error: null }),
          });
        } else if (r.gone) {
          summary.removed++;
          await rest(cfg, `push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' });
        } else {
          failedHere++;
          summary.failed++;
          summary.errors.push(`push ${new URL(sub.endpoint).host}: ${r.error}`);
          await rest(cfg, `push_subscriptions?id=eq.${sub.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ last_error: (r.error ?? 'failed').slice(0, 500) }),
          });
        }
      }
    } else {
      summary.nothingToSay++;
    }

    // Mark the day done unless every device failed (then a later run retries).
    if (opts.markSent && (delivered > 0 || failedHere === 0)) {
      await rest(cfg, 'user_settings?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: userId, digest_last_sent_on: today }),
      });
    }
  }
}

export async function handle(req: Request, env: Env, now = new Date()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const { config: cfg, missing } = readConfig(env);
  if (!cfg) return json({ error: `Function is missing settings: ${missing.join(', ')}` }, 500);

  const body = (await req.json().catch(() => ({}))) as { mode?: string; force?: boolean; endpoint?: string };
  const uk = ukNow(now);
  const summary: Summary = {
    ukTime: `${uk.date} ${uk.time}`,
    mode: '',
    users: 0,
    sent: 0,
    failed: 0,
    removed: 0,
    nothingToSay: 0,
    alreadySent: 0,
    errors: [],
  };

  try {
    const secret = req.headers.get('x-digest-secret');
    if (secret !== null) {
      // Scheduled run from GitHub Actions.
      if (!safeEqual(secret, cfg.digestSecret)) return json({ error: 'Bad digest secret' }, 401);
      const force = body.force === true;
      summary.mode = force ? 'digest (forced)' : 'digest';
      if (!force && (uk.hour < 8 || uk.hour >= 12)) {
        return json({ ...summary, skipped: 'Outside 08:00–12:00 UK time' });
      }
      await runDigest(cfg, { force, markSent: true }, now, summary);
      return json(summary);
    }

    // "Send a test" from the app: the user's own session token.
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const userId = token ? await userFromToken(cfg, token) : null;
    if (!userId) return json({ error: 'Sign in first' }, 401);
    summary.mode = 'test';
    await runDigest(
      cfg,
      { userId, endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined, force: true, markSent: false },
      now,
      summary,
    );
    if (!summary.users) return json({ ...summary, error: 'This device has not turned notifications on yet' }, 404);
    return json(summary);
  } catch (e) {
    summary.errors.push((e as Error).message);
    return json(summary, 500);
  }
}

// Supabase / Deno entry point (skipped when the file is imported by the Node tests).
const deno = (globalThis as { Deno?: { env: Env; serve(h: (req: Request) => Promise<Response>): unknown } }).Deno;
if (deno?.serve) deno.serve((req) => handle(req, deno.env));
