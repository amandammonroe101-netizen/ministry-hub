import { useLocation, useNavigate } from 'react-router-dom';
import NavRail from '../../components/layout/NavRail';
import {
  getSocialMediaPage,
  SOCIAL_MEDIA_OVERVIEW,
  SOCIAL_MEDIA_GROUPS,
  SOCIAL_MEDIA_ACCENT,
} from './socialMediaConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Social Media — generic "Coming Soon" page.

   Renders the global NavRail on the left and a placeholder
   panel on the right that introduces what the page will become.
   Reads its title / icon / description / accent from
   `socialMediaConfig.js` based on the current route, so a
   single route element can serve every Social Media sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <SocialContentStudio />).
     2. In App.jsx, swap the <SocialMediaComingSoon /> on that
        route for the real component. Keep the entry in
        socialMediaConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function SocialMediaComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getSocialMediaPage(pathname) || SOCIAL_MEDIA_OVERVIEW;

  const isOverview = page.path === SOCIAL_MEDIA_OVERVIEW.path;
  const accent     = page.accent || SOCIAL_MEDIA_ACCENT;

  return (
    <div className="sm-root" style={{ '--sm-accent': accent }}>
      <NavRail />

      <main className="sm-main">
        <div className="sm-shell">

          <header className="sm-header">
            <div className="sm-crumbs">
              <span
                className="sm-crumb sm-crumb-link"
                onClick={() => navigate(SOCIAL_MEDIA_OVERVIEW.path)}
                title="Go to Social Media Overview"
              >
                📱 Social Media Ministry
              </span>
              {!isOverview && (
                <>
                  <span className="sm-crumb-sep">/</span>
                  <span className="sm-crumb">{page.groupIcon} {page.group}</span>
                </>
              )}
            </div>
            <div className="sm-title-row">
              <span className="sm-title-icon" aria-hidden="true">{page.icon}</span>
              <h1 className="sm-title">{page.label}</h1>
              <span className="sm-badge">Coming soon</span>
            </div>
            {page.description && (
              <p className="sm-description">{page.description}</p>
            )}
          </header>

          <section className="sm-card">
            <div className="sm-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="sm-card-title">This page is on the way</h2>
            <p className="sm-card-copy">
              The Social Media Ministry tab is fully wired into
              the sidebar so each sub-page can be built
              independently. The Content Studio and Calendar &
              Campaigns are the day-to-day spine — pick another
              section from the rail on the left, or jump back to
              the Overview to plan what to tackle next.
            </p>
            <div className="sm-card-actions">
              {!isOverview && (
                <button
                  type="button"
                  className="sm-btn sm-btn-primary"
                  onClick={() => navigate(SOCIAL_MEDIA_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
              )}
              <button
                type="button"
                className="sm-btn sm-btn-ghost"
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
            </div>
          </section>

          {isOverview && (
            <section className="sm-map">
              <h2 className="sm-map-title">Everything in Social Media</h2>
              <p className="sm-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {SOCIAL_MEDIA_GROUPS.map(group => (
                <div key={group.key} className="sm-map-group">
                  <h3 className="sm-map-group-title">
                    <span className="sm-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="sm-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="sm-map-card"
                        style={{ '--sm-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="sm-map-card-icon">{item.icon}</span>
                        <span className="sm-map-card-label">{item.label}</span>
                        <span className="sm-map-card-desc">{item.description}</span>
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
