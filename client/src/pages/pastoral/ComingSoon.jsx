import { useLocation, useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import {
  getPastoralPage,
  PASTORAL_OVERVIEW,
  PASTORAL_GROUPS,
  PASTORAL_ACCENT,
} from './pastoralConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Pastoral / Teaching — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `pastoralConfig.js` based on the current route, so a single
   route element can serve every Pastoral sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <PastoralSermonWriter />).
     2. In App.jsx, swap the <PastoralComingSoon /> on that
        route for the real component. Keep the entry in
        pastoralConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function PastoralComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getPastoralPage(pathname) || PASTORAL_OVERVIEW;

  const isOverview = page.path === PASTORAL_OVERVIEW.path;
  const accent     = page.accent || PASTORAL_ACCENT;

  return (
    <div className="pt-root" style={{ '--pt-accent': accent }}>
      <NavRail />

      <main className="pt-main">
        <div className="pt-shell">

          <header className="pt-header">
            <div className="pt-crumbs">
              <span
                className="pt-crumb pt-crumb-link"
                onClick={() => navigate(PASTORAL_OVERVIEW.path)}
                title="Go to Pastoral / Teaching Overview"
              >
                ⛪ Pastoral / Teaching Ministry
              </span>
              {!isOverview && (
                <>
                  <span className="pt-crumb-sep">/</span>
                  <span className="pt-crumb">{page.groupIcon} {page.group}</span>
                </>
              )}
            </div>
            <div className="pt-title-row">
              <span className="pt-title-icon" aria-hidden="true">{page.icon}</span>
              <h1 className="pt-title">{page.label}</h1>
              <span className="pt-badge">Coming soon</span>
            </div>
            {page.description && (
              <p className="pt-description">{page.description}</p>
            )}
          </header>

          <section className="pt-card">
            <div className="pt-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="pt-card-title">This page is on the way</h2>
            <p className="pt-card-copy">
              The Pastoral / Teaching Ministry tab is fully wired
              into the sidebar so each sub-page can be built
              independently. The Sermon Workshop and Reusable
              Notes library are the centerpiece — start there
              when you're ready to build out the sermon-creation
              flow.
            </p>
            <div className="pt-card-actions">
              {!isOverview && (
                <button
                  type="button"
                  className="pt-btn pt-btn-primary"
                  onClick={() => navigate(PASTORAL_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
              )}
              <button
                type="button"
                className="pt-btn pt-btn-ghost"
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
            </div>
          </section>

          {isOverview && (
            <section className="pt-map">
              <h2 className="pt-map-title">Everything in Pastoral / Teaching</h2>
              <p className="pt-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {PASTORAL_GROUPS.map(group => (
                <div key={group.key} className="pt-map-group">
                  <h3 className="pt-map-group-title">
                    <span className="pt-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="pt-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="pt-map-card"
                        style={{ '--pt-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="pt-map-card-icon">{item.icon}</span>
                        <span className="pt-map-card-label">{item.label}</span>
                        <span className="pt-map-card-desc">{item.description}</span>
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
