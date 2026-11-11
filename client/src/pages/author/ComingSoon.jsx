import { useLocation, useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import {
  getAuthorPage,
  AUTHOR_OVERVIEW,
  AUTHOR_GROUPS,
  AUTHOR_ACCENT,
} from './authorConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Author — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `authorConfig.js` based on the current route, so a single
   route element can serve every Author sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <AuthorBookWriter />).
     2. In App.jsx, swap the <AuthorComingSoon /> on that route
        for the real component. Keep the entry in
        authorConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function AuthorComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getAuthorPage(pathname) || AUTHOR_OVERVIEW;

  const isOverview = page.path === AUTHOR_OVERVIEW.path;
  const accent     = page.accent || AUTHOR_ACCENT;

  return (
    <div className="au-root" style={{ '--au-accent': accent }}>
      <NavRail />

      <main className="au-main">
        <div className="au-shell">

          <header className="au-header">
            <div className="au-crumbs">
              <span
                className="au-crumb au-crumb-link"
                onClick={() => navigate(AUTHOR_OVERVIEW.path)}
                title="Go to Author Overview"
              >
                🪶 Author Ministry
              </span>
              {!isOverview && (
                <>
                  <span className="au-crumb-sep">/</span>
                  <span className="au-crumb">{page.groupIcon} {page.group}</span>
                </>
              )}
            </div>
            <div className="au-title-row">
              <span className="au-title-icon" aria-hidden="true">{page.icon}</span>
              <h1 className="au-title">{page.label}</h1>
              <span className="au-badge">Coming soon</span>
            </div>
            {page.description && (
              <p className="au-description">{page.description}</p>
            )}
          </header>

          <section className="au-card">
            <div className="au-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="au-card-title">This page is on the way</h2>
            <p className="au-card-copy">
              The Author Ministry tab is fully wired into the
              sidebar so each sub-page can be built independently.
              The Book Workshop and Devotional Workshop are the
              centerpiece — capture ideas in the Ideas section,
              then write in the workshops when you're ready.
            </p>
            <div className="au-card-actions">
              {!isOverview && (
                <button
                  type="button"
                  className="au-btn au-btn-primary"
                  onClick={() => navigate(AUTHOR_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
              )}
              <button
                type="button"
                className="au-btn au-btn-ghost"
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
            </div>
          </section>

          {isOverview && (
            <section className="au-map">
              <h2 className="au-map-title">Everything in Author Ministry</h2>
              <p className="au-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {AUTHOR_GROUPS.map(group => (
                <div key={group.key} className="au-map-group">
                  <h3 className="au-map-group-title">
                    <span className="au-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="au-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="au-map-card"
                        style={{ '--au-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="au-map-card-icon">{item.icon}</span>
                        <span className="au-map-card-label">{item.label}</span>
                        <span className="au-map-card-desc">{item.description}</span>
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
