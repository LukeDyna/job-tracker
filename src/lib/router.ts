import { useEffect, useState } from 'react';

// Hash routing: works on GitHub Pages with no 404 rewrites and keeps the
// installed PWA on its start URL.
//   #/            -> home (needs attention)
//   #/suggestions -> daily job-search suggestions
//   #/jobs        -> list
//   #/jobs/new    -> add
//   #/jobs/:id    -> detail
//   #/jobs/:id/edit
//   #/settings

export type Route =
  | { name: 'home' }
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'settings' }
  | { name: 'suggestions' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'jobs') {
    if (parts[1] === 'new') return { name: 'new' };
    if (parts[1] && parts[2] === 'edit') return { name: 'edit', id: parts[1] };
    if (parts[1]) return { name: 'detail', id: parts[1] };
    return { name: 'list' };
  }
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'suggestions') return { name: 'suggestions' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

export function go(path: string, replace = false) {
  const hash = `#${path}`;
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function back(fallback = '/jobs') {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
}
