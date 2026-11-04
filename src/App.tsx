import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configMissing, supabase } from './lib/supabase';
import { StoreProvider } from './lib/store';
import { useRoute } from './lib/router';
import { Login } from './pages/Login';
import { JobList } from './pages/JobList';
import { JobDetail } from './pages/JobDetail';
import { JobForm } from './pages/JobForm';
import { Settings } from './pages/Settings';
import { Home } from './pages/Home';
import { Suggestions } from './pages/Suggestions';
import { TabBar } from './components/TabBar';
import { ToastHost } from './components/Toast';
import { InstallPrompt } from './components/InstallPrompt';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (configMissing) {
    return (
      <div className="login">
        <div className="login-card">
          <h1>Setup needed</h1>
          <p className="muted">
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set. Locally, copy <code>.env.example</code> to{' '}
            <code>.env.local</code>; for GitHub Pages, set them as repository variables.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="splash" aria-busy="true" />;
  if (!session)
    return (
      <>
        <Login />
        <InstallPrompt />
      </>
    );

  return (
    <StoreProvider userId={session.user.id} key={session.user.id}>
      <Shell email={session.user.email ?? ''} />
      <InstallPrompt />
    </StoreProvider>
  );
}

function Shell({ email }: { email: string }) {
  const route = useRoute();

  let page;
  switch (route.name) {
    case 'new':
      page = <JobForm />;
      break;
    case 'edit':
      page = <JobForm id={route.id} />;
      break;
    case 'detail':
      page = <JobDetail id={route.id} />;
      break;
    case 'settings':
      page = <Settings email={email} />;
      break;
    case 'suggestions':
      page = <Suggestions />;
      break;
    case 'list':
      page = <JobList />;
      break;
    case 'home':
    default:
      page = <Home />;
  }

  const showTabs = route.name !== 'new' && route.name !== 'edit';
  return (
    <div className={`app ${showTabs ? 'with-tabs' : ''}`}>
      {page}
      {showTabs && <TabBar route={route} />}
      <ToastHost />
    </div>
  );
}
