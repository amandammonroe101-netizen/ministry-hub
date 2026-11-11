import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getYouthPage,
  YOUTH_OVERVIEW,
  YOUTH_GROUPS,
  YOUTH_ACCENT,
} from './youthConfig';
import YouthShell from './YouthShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import YouthMenuSettings from './YouthMenuSettings';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Youth — generic "Coming Soon" page.

   Renders the Youth bespoke shell with a placeholder panel that
   introduces what the page will become. Reads its title / icon /
   description / accent from `youthConfig.js` based on the current
   route, so a single route element can serve every Youth sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <YouthStudents />).
     2. In App.jsx, swap the <ComingSoon /> on that route for
        the real component. Keep the entry in youthConfig.js so
        the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function ComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getYouthPage(pathname) || YOUTH_OVERVIEW;
  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  const isOverview = page.path === YOUTH_OVERVIEW.path;
  const accent     = page.accent || YOUTH_ACCENT;

  return (
    <YouthShell
      groupLabel={!isOverview ? page.group : undefined}
      groupIcon={!isOverview ? page.groupIcon : undefined}
      icon={page.icon}
      title={page.label}
      subtitle={page.description}
      accent={accent}
      actions={<span className="yc-badge">Coming soon</span>}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="yc-shell">
        <section className="yc-card">
          <div className="yc-card-emblem" aria-hidden="true">🛠</div>
          <h2 className="yc-card-title">This page is on the way</h2>
          <p className="yc-card-copy">
            The Youth Ministry tab is fully wired into the sidebar so
            each sub-page can be built independently. Pick another
            section from the rail on the left, or jump back to the
            Overview to plan what to tackle next.
          </p>
          <div className="yc-card-actions">
            {!isOverview && (
              <button
                type="button"
                className="yc-btn yc-btn-primary"
                onClick={() => navigate(YOUTH_OVERVIEW.path)}
              >
                🏠 Back to Overview
              </button>
            )}
            <button
              type="button"
              className="yc-btn yc-btn-ghost"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </div>
        </section>

        {isOverview && (
          <section className="yc-map">
            <h2 className="yc-map-title">Everything in Youth Ministry</h2>
            <p className="yc-map-sub">
              Click any card to open its (Coming Soon) page.
            </p>
            {YOUTH_GROUPS.map(group => (
              <div key={group.key} className="yc-map-group">
                <h3 className="yc-map-group-title">
                  <span className="yc-map-group-icon">{group.icon}</span>
                  {group.label}
                </h3>
                <div className="yc-map-grid">
                  {group.items.map(item => (
                    <button
                      key={item.path}
                      type="button"
                      className="yc-map-card"
                      style={{ '--yc-card-accent': item.accent || group.color }}
                      onClick={() => navigate(item.path)}
                    >
                      <span className="yc-map-card-icon">{item.icon}</span>
                      <span className="yc-map-card-label">{item.label}</span>
                      <span className="yc-map-card-desc">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
      <ProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        pageTabLabel="⚡ Customize Menu"
        pageSettings={<YouthMenuSettings />}
      />
    </YouthShell>
  );
}
