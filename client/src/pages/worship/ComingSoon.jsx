import { useLocation, useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import {
  getWorshipPage,
  WORSHIP_OVERVIEW,
  WORSHIP_GROUPS,
  WORSHIP_ACCENT,
} from './worshipConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Worship — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `worshipConfig.js` based on the current route, so a single
   route element can serve every Worship sub-page that doesn't
   yet have a real component wired up in App.jsx.

   To replace this with a real page later:
     1. Build the real component.
     2. In App.jsx, swap the <WorshipComingSoon /> on that
        route for the real component. Keep the entry in
        worshipConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function WorshipComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getWorshipPage(pathname) || WORSHIP_OVERVIEW;

  const isOverview = page.path === WORSHIP_OVERVIEW.path;
  const accent     = page.accent || WORSHIP_ACCENT;

  return (
    <div className="wc-root" style={{ '--wc-accent': accent }}>
      <NavRail />

      <main className="wc-main">
        <div className="wc-shell">

          <header className="wc-header">
            <div className="wc-crumbs">
              <span
                className="wc-crumb wc-crumb-link"
                onClick={() => navigate(WORSHIP_OVERVIEW.path)}
                title="Go to Worship Overview"
              >
                🎶 Worship Ministry
              </span>
              {!isOverview && (
                <>
                  <span className="wc-crumb-sep">/</span>
                  <span className="wc-crumb">{page.groupIcon} {page.group}</span>
                </>
              )}
            </div>
            <div className="wc-title-row">
              <span className="wc-title-icon" aria-hidden="true">{page.icon}</span>
              <h1 className="wc-title">{page.label}</h1>
              <span className="wc-badge">Coming soon</span>
            </div>
            {page.description && (
              <p className="wc-description">{page.description}</p>
            )}
          </header>

          <section className="wc-card">
            <div className="wc-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="wc-card-title">This page is on the way</h2>
            <p className="wc-card-copy">
              The Worship Ministry tab is fully wired into the sidebar so
              each sub-page can be built independently. Pick another
              section from the rail on the left, or jump back to the
              Overview to plan what to tackle next.
            </p>
            <div className="wc-card-actions">
              {!isOverview && (
                <button
                  type="button"
                  className="wc-btn wc-btn-primary"
                  onClick={() => navigate(WORSHIP_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
              )}
              <button
                type="button"
                className="wc-btn wc-btn-ghost"
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
            </div>
          </section>

          {isOverview && (
            <section className="wc-map">
              <h2 className="wc-map-title">Everything in Worship Ministry</h2>
              <p className="wc-map-sub">
                Click any card to open its page.
              </p>
              {WORSHIP_GROUPS.map(group => (
                <div key={group.key} className="wc-map-group">
                  <h3 className="wc-map-group-title">
                    <span className="wc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="wc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="wc-map-card"
                        style={{ '--wc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="wc-map-card-icon">{item.icon}</span>
                        <span className="wc-map-card-label">{item.label}</span>
                        <span className="wc-map-card-desc">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
