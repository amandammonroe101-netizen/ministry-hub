import { useNavigate, useLocation } from 'react-router-dom';
import './NavRail.css';

const NAV = [
  { path: '/journal',  icon: '📖', label: 'Journal',  color: 'var(--tab-journal)' },
  { path: '/prayers',  icon: '🙏', label: 'Prayers',  color: 'var(--tab-prayers)' },
  { path: '/friends',  icon: '👥', label: 'Friends',  color: 'var(--tab-friends)' },
  { path: '/calendar', icon: '📅', label: 'Calendar', color: 'var(--accent-amber)' },
  { path: '/habits',   icon: '✅', label: 'Habits',   color: 'var(--accent-blue)'  },
];

export default function NavRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="nav-rail" aria-label="Main navigation">
      {NAV.map(n => {
        const active = pathname.startsWith(n.path);
        return (
          <button
            key={n.path}
            className={`nr-btn ${active ? 'on' : ''} ${n.disabled ? 'disabled' : ''}`}
            onClick={() => !n.disabled && navigate(n.path)}
            title={n.disabled ? `${n.label} (coming soon)` : n.label}
            aria-label={n.label}
            aria-current={active ? 'page' : undefined}
            style={{ '--tab-color': n.color }}
          >
            <span className="nr-icon">{n.icon}</span>
            <span className="nr-label">{n.label}</span>
            {active && <span className="nr-indicator" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
