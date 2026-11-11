import { useLocation, useNavigate } from 'react-router-dom';
import WebsiteShell from './WebsiteShell';
import {
  getWebsitePage,
  WEBSITE_OVERVIEW,
  WEBSITE_GROUPS,
  WEBSITE_ACCENT,
} from './websiteConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Website — generic "Coming Soon" page.

   Every current Website sub-page already has a real component
   wired up in App.jsx, so this is only a safety fallback: it
   renders if a path is ever added to websiteConfig.js before its
   real component is wired to a route.
   ───────────────────────────────────────────────────────────── */

export default function WebsiteComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getWebsitePage(pathname) || WEBSITE_OVERVIEW;

  const isOverview = page.path === WEBSITE_OVERVIEW.path;
  const accent     = page.accent || WEBSITE_ACCENT;

  return (
    <WebsiteShell title={page.label} icon={page.icon} subtitle={page.description}>
      <div className="wc-root" style={{ '--wc-accent': accent }}>

        {!isOverview && (
          <section className="wc-card">
            <div className="wc-card-emblem" aria-hidden="true">🛠</div>
            <h2 className="wc-card-title">This page is on the way</h2>
            <p className="wc-card-copy">
              The Website Ministry tab is fully wired into the sidebar
              so each sub-page can be built independently. Pick another
              section from the menu, or jump back to the Overview.
            </p>
            <div className="wc-card-actions">
              <button
                type="button"
                className="wc-btn wc-btn-primary"
                onClick={() => navigate(WEBSITE_OVERVIEW.path)}
              >
                🏠 Back to Overview
              </button>
              <button type="button" className="wc-btn wc-btn-ghost" onClick={() => navigate(-1)}>
                ← Back
              </button>
            </div>
          </section>
        )}

        {isOverview && (
          <section className="wc-map">
            <h2 className="wc-map-title">Everything in Website Ministry</h2>
            <p className="wc-map-sub">Click any card to open its page.</p>
            {WEBSITE_GROUPS.map(group => (
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
    </WebsiteShell>
  );
}
