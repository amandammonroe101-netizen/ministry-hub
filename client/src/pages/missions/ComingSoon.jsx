import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MissionsShell from './MissionsShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import {
  getMissionsPage,
  MISSIONS_OVERVIEW,
  MISSIONS_GROUPS,
  MISSIONS_ACCENT,
} from './missionsConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Missions — generic "Coming Soon" page.

   Renders inside the bespoke MissionsShell (ocean/horizon nav +
   header) and a placeholder panel that introduces what the page
   will become. Reads its title / icon / description / accent from
   `missionsConfig.js` based on the current route, so a single
   route element can serve every Missions sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <MissionsSentOnes />).
     2. In App.jsx, swap the <MissionsComingSoon /> on that
        route for the real component. Keep the entry in
        missionsConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function MissionsComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getMissionsPage(pathname) || MISSIONS_OVERVIEW;

  const isOverview = page.path === MISSIONS_OVERVIEW.path;
  const accent     = page.accent || MISSIONS_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <MissionsShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="mis-root" style={{ '--mis-accent': accent }}>
        <div className="mis-shell">

          {!isOverview && (
            <section className="mis-card">
              <div className="mis-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="mis-card-title">This page is on the way</h2>
              <p className="mis-card-copy">
                The Missions Ministry tab is fully wired into the
                nav so each sub-page can be built independently.
                Pick another section from the compass menu, or
                jump back to the Overview to plan what to tackle next.
              </p>
              <div className="mis-card-actions">
                <button
                  type="button"
                  className="mis-btn mis-btn-primary"
                  onClick={() => navigate(MISSIONS_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="mis-btn mis-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="mis-map">
              <h2 className="mis-map-title">Everything in Missions Ministry</h2>
              <p className="mis-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {MISSIONS_GROUPS.map(group => (
                <div key={group.key} className="mis-map-group">
                  <h3 className="mis-map-group-title">
                    <span className="mis-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="mis-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="mis-map-card"
                        style={{ '--mis-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="mis-map-card-icon">{item.icon}</span>
                        <span className="mis-map-card-label">{item.label}</span>
                        <span className="mis-map-card-desc">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

        </div>
      </div>

      <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
    </MissionsShell>
  );
}
