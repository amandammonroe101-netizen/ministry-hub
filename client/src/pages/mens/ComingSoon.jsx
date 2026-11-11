import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MensShell from './MensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import MensMenuSettings from './MensMenuSettings';
import {
  getMensPage,
  MENS_OVERVIEW,
  MENS_GROUPS,
  MENS_ACCENT,
} from './mensConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Men's — generic "Coming Soon" page.

   Renders the bespoke MensShell (nav + header) and a placeholder
   panel that introduces what the page will become. Reads its
   title / icon / description / accent from `mensConfig.js` based
   on the current route, so a single route element can serve
   every Men's sub-page. Mirrors WomensComingSoon.jsx exactly.

   To replace this with a real page later:
     1. Build the real component (e.g. <MensBibleStudies />).
     2. In App.jsx, swap the <MensComingSoon /> on that
        route for the real component. Keep the entry in
        mensConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function MensComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getMensPage(pathname) || MENS_OVERVIEW;

  const isOverview = page.path === MENS_OVERVIEW.path;
  const accent     = page.accent || MENS_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <MensShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="mc-root" style={{ '--mc-accent': accent }}>
        <div className="mc-shell">

          {!isOverview && (
            <section className="mc-card">
              <div className="mc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="mc-card-title">This page is on the way</h2>
              <p className="mc-card-copy">
                The Men's Ministry tab is fully wired into the menu so
                each sub-page can be built independently. Pick another
                section from the compass menu, or jump back to the
                Overview to plan what to tackle next.
              </p>
              <div className="mc-card-actions">
                <button
                  type="button"
                  className="mc-btn mc-btn-primary"
                  onClick={() => navigate(MENS_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="mc-btn mc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="mc-map">
              <h2 className="mc-map-title">Everything in Men's Ministry</h2>
              <p className="mc-map-sub">
                Click any card to open its page.
              </p>
              {MENS_GROUPS.map(group => (
                <div key={group.key} className="mc-map-group">
                  <h3 className="mc-map-group-title">
                    <span className="mc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="mc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="mc-map-card"
                        style={{ '--mc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="mc-map-card-icon">{item.icon}</span>
                        <span className="mc-map-card-label">{item.label}</span>
                        <span className="mc-map-card-desc">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </div>

      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="🧭 Page Settings"
        pageSettings={<MensMenuSettings />}
      />
    </MensShell>
  );
}
