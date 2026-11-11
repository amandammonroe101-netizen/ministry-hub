import { useLocation, useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import {
  getHospitalityPage,
  HOSPITALITY_OVERVIEW,
  HOSPITALITY_GROUPS,
  HOSPITALITY_ACCENT,
} from './hospitalityConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Hospitality — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `hospitalityConfig.js` based on the current route, so a single
   route element can serve every Hospitality sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <HospitalityGreeters />).
     2. In App.jsx, swap the <HospitalityComingSoon /> on that
        route for the real component. Keep the entry in
        hospitalityConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function HospitalityComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getHospitalityPage(pathname) || HOSPITALITY_OVERVIEW;

  const isOverview = page.path === HOSPITALITY_OVERVIEW.path;
  const accent     = page.accent || HOSPITALITY_ACCENT;

  return (
    <div className="hc-root" style={{ '--hc-accent': accent }}>
      <NavRail />

      <main className="hc-main">
        <div className="hc-shell">

          <header className="hc-header">
            <div className="hc-crumbs">
              <span
                className="hc-crumb hc-crumb-link"
                onClick={() => navigate(HOSPITALITY_OVERVIEW.path)}
                title="Go to Hospitality Overview"
              >
                🤗 Hospitality Ministry
              </span>
              {!isOverview && (
                <>
                  <span className="hc-crumb-sep">/</span>
                  <span className="hc-crumb">{page.groupIcon} {page.group}</span>
                </>
              )}
            </div>
            <div className="hc-title-row">
              <span className="hc-title-icon" aria-hidden="true">{page.icon}</span>
              <h1 className="hc-title">{page.label}</h1>
              <span className="hc-badge">Coming soon</span>
            </div>
            {page.description && (
              <p className="hc-description">{page.description}</p>
            )}
          </header>

          <section className="hc-card">
            <div className="hc-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="hc-card-title">This page is on the way</h2>
            <p className="hc-card-copy">
              The Hospitality Ministry tab is fully wired into the
              sidebar so each sub-page can be built independently.
              Pick another section from the rail on the left, or
              jump back to the Overview to plan what to tackle next.
            </p>
            <div className="hc-card-actions">
              {!isOverview && (
                <button
                  type="button"
                  className="hc-btn hc-btn-primary"
                  onClick={() => navigate(HOSPITALITY_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
              )}
              <button
                type="button"
                className="hc-btn hc-btn-ghost"
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
            </div>
          </section>

          {isOverview && (
            <section className="hc-map">
              <h2 className="hc-map-title">Everything in Hospitality Ministry</h2>
              <p className="hc-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {HOSPITALITY_GROUPS.map(group => (
                <div key={group.key} className="hc-map-group">
                  <h3 className="hc-map-group-title">
                    <span className="hc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="hc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="hc-map-card"
                        style={{ '--hc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="hc-map-card-icon">{item.icon}</span>
                        <span className="hc-map-card-label">{item.label}</span>
                        <span className="hc-map-card-desc">{item.description}</span>
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
