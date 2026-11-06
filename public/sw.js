/* Job Tracker service worker: offline app shell + web push (phase 4). */
const CACHE = 'job-tracker-v2';
const SCOPE = self.registration.scope; // e.g. https://user.github.io/job-tracker/
const SHELL = [SCOPE, `${SCOPE}index.html`, `${SCOPE}manifest.webmanifest`, `${SCOPE}icons/icon-192.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only our own files. Supabase API calls always go to the network.
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  // Page loads: network first so updates arrive promptly; cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(`${SCOPE}index.html`, copy));
          return res;
        })
        .catch(() => caches.match(`${SCOPE}index.html`).then((r) => r || caches.match(SCOPE))),
    );
    return;
  }

  // Hashed build assets and icons: cache first, then network (and remember it).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ---- Web push: the 8am summary from the daily-digest function ----
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Job Tracker';
  // Links are relative to the app ("#/", "#/suggestions").
  const url = new URL(data.url || '#/', SCOPE).href;
  const jobs = [
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: `${SCOPE}icons/icon-192.png`,
      badge: `${SCOPE}icons/icon-192.png`,
      tag: data.tag || 'job-tracker',
      data: { url },
    }),
  ];
  // Red number on the Home Screen icon (cleared when the app is opened).
  if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
    jobs.push((data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || `${SCOPE}#/`;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(SCOPE) && 'focus' in w) {
          w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
