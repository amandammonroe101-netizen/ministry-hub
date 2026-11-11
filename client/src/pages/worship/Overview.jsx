import { useNavigate } from 'react-router-dom';
import WorshipShell from './WorshipShell';
import WorshipOverviewCalendar from './OverviewCalendar';
import { WORSHIP_GROUPS, WORSHIP_ACCENT } from './worshipConfig';
import './Overview.css';

/* ─────────────────────────────────────────────────────────────
   Worship — Overview / landing page.

   A navigational grid of every group and sub-page, so there's a
   real landing dashboard at /worship without inventing new data
   wiring for a features that already have their own pages.
   ───────────────────────────────────────────────────────────── */

export default function WorshipOverview() {
  const navigate = useNavigate();

  return (
    <WorshipShell
      title="Overview"
      icon="🏠"
      subtitle="Everything in Worship Ministry — live-service tools, recording & production, song management, the band roster, gear, and admin."
    >
      <div className="wov-root" style={{ '--wov-accent': WORSHIP_ACCENT }}>
        <WorshipOverviewCalendar />

        <div className="wov-map">
          {WORSHIP_GROUPS.map(group => (
            <div key={group.key} className="wov-map-group">
              <h3 className="wov-map-group-title">
                <span className="wov-map-group-icon">{group.icon}</span>
                {group.label}
              </h3>
              <div className="wov-map-grid">
                {group.items.map(item => (
                  <button
                    key={item.path}
                    type="button"
                    className="wov-map-card"
                    style={{ '--wov-card-accent': item.accent || group.color }}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="wov-map-card-icon">{item.icon}</span>
                    <span className="wov-map-card-label">{item.label}</span>
                    <span className="wov-map-card-desc">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WorshipShell>
  );
}
