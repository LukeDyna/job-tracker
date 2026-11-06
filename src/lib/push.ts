import { supabase } from './supabase';
import { isIOS, isStandalone } from './download';

/** VAPID public key (safe to publish). Set as VITE_VAPID_PUBLIC_KEY. */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || '';

export type PushState =
  | 'unconfigured' // no VAPID key in this build
  | 'needs-install' // iPhone/iPad in Safari: push only works from the Home Screen app
  | 'unsupported' // no service worker / push in this browser (or local dev)
  | 'denied' // the user blocked notifications
  | 'off'
  | 'on';

export interface PushDevice {
  id: string;
  endpoint: string;
  device: string | null;
  created_at: string;
  last_sent_at: string | null;
  last_error: string | null;
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg?.pushManager ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** "iPhone · Safari", "Mac · Chrome"… so she can tell her devices apart. */
export function deviceLabel(ua = navigator.userAgent): string {
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? 'iPad'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Android/.test(ua)
          ? 'Android'
          : /Windows/.test(ua)
            ? 'Windows PC'
            : 'Computer';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua) || /CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  const app = isStandalone() ? 'app' : browser;
  return app ? `${device} · ${app}` : device;
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('The browser returned an incomplete subscription');
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device: deviceLabel().slice(0, 200),
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) throw error;
}

/** Ask permission, subscribe this device and store it. Call straight from a tap (iOS requires it). */
export async function enablePush(userId: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';

  const reg = await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    // Subscribed with an old server key: start again.
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await saveSubscription(userId, sub);
  return 'on';
}

/** Unsubscribe this device and forget it. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** Keep the stored subscription fresh (browsers occasionally rotate them). Silent. */
export async function syncPushSubscription(userId: string): Promise<void> {
  try {
    if ((await getPushState()) !== 'on') return;
    const sub = await currentSubscription();
    if (sub) await saveSubscription(userId, sub);
  } catch {
    /* best effort */
  }
}

export async function listDevices(): Promise<PushDevice[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id,endpoint,device,created_at,last_sent_at,last_error')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as PushDevice[];
}

export async function removeDevice(id: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('id', id);
  if (error) throw error;
}

/** Send today's summary to this device now. Returns a short message for a toast. */
export async function sendTestPush(): Promise<string> {
  const sub = await currentSubscription();
  if (!sub) return 'Turn notifications on first';
  const { data, error } = await supabase.functions.invoke('daily-digest', {
    body: { mode: 'test', endpoint: sub.endpoint },
  });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json().catch(() => null)) as { error?: string; errors?: string[] } | null;
      detail = body?.error ?? body?.errors?.[0] ?? detail;
    }
    return `Couldn't send: ${detail}`;
  }
  const result = data as { sent?: number; removed?: number; errors?: string[] };
  if (result.sent) return 'Sent! It should arrive in a few seconds';
  if (result.removed) return 'This device stopped accepting notifications. Turn them on again.';
  return `Couldn't send: ${result.errors?.[0] ?? 'unknown error'}`;
}

/** Clear the red badge on the Home Screen icon. */
export function clearAppBadge(): void {
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  nav.clearAppBadge?.().catch(() => {});
}
