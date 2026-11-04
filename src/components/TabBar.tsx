import type { Route } from '../lib/router';
import { useStore } from '../lib/store';
import type { Colour } from '../lib/types';
import { Icon, type IconName } from './Icon';

export function TabBar({ route }: { route: Route }) {
  const { suggestions } = useStore();
  const tab = (href: string, icon: IconName, label: string, colour: Colour, active: boolean, badge?: number) => (
    <a href={href} className={`c-${colour} ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">
        <Icon name={icon} size={23} stroke={active ? 2.4 : 2} />
        {badge ? <span className="tab-badge">{badge > 9 ? '9+' : badge}</span> : null}
      </span>
      <span>{label}</span>
    </a>
  );

  return (
    <nav className="tabbar" aria-label="Main">
      {tab('#/', 'home', 'Today', 'blue', route.name === 'home')}
      {tab('#/jobs', 'briefcase', 'Jobs', 'indigo', route.name === 'list' || route.name === 'detail')}
      <a href="#/jobs/new" className="add" aria-label="Add job">
        <span className="add-circle">
          <Icon name="plus" size={26} stroke={2.6} />
        </span>
      </a>
      {tab('#/suggestions', 'sparkle', 'Ideas', 'purple', route.name === 'suggestions', suggestions.length)}
      {tab('#/settings', 'settings', 'Settings', 'gray', route.name === 'settings')}
    </nav>
  );
}
