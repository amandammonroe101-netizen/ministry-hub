import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DiscipleshipShell from './DiscipleshipShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import DiscipleshipMenuSettings from './DiscipleshipMenuSettings';
import {
  getDiscipleshipPage,
  DISCIPLESHIP_OVERVIEW,
  DISCIPLESHIP_GROUPS,
  DISCIPLESHIP_ACCENT,
} from './discipleshipConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Discipleship — generic "Coming Soon" page.

   Renders the bespoke DiscipleshipShell (nav + header) and a
   placeholder panel that introduces what the page will become.
   Reads its title / icon / description / accent from
   `discipleshipConfig.js` based on the current route, so a single
   route element can serve every Discipleship sub-page. Mirrors
   WomensComingSoon.jsx / MensComingSoon.jsx exactly.

   To replace this with a real page later:
     1. Build the real component (e.g. <DiscipleshipBaptism />).
     2. In App.jsx, swap the <DiscipleshipComingSoon /> on that
        route for the real component. Keep the entry in
        discipleshipConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function DiscipleshipComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getDiscipleshipPage(pathname) || DISCIPLESHIP_OVERVIEW;

  const isOverview = page.path === DISCIPLESHIP_OVERVIEW.path;
  const accent     = page.accent || DISCIPLESHIP_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <DiscipleshipShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="dc-root" style={{ '--dc-accent': accent }}>
        <div className="dc-shell">

          {!isOverview && (
            <section className="dc-card">
              <div className="dc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="dc-card-title">This page is on the way</h2>
              <p className="dc-card-copy">
                The Discipleship Ministry tab is fully wired into the
                menu so each sub-page can be built independently.
                Pick another section from the leaf menu, or jump back
                to the Overview to plan what to tackle next.
              </p>
              <div className="dc-card-actions">
                <button
                  type="button"
                  className="dc-btn dc-btn-primary"
                  onClick={() => navigate(DISCIPLESHIP_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="dc-btn dc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="dc-map">
              <h2 className="dc-map-title">Everything in Discipleship Ministry</h2>
              <p className="dc-map-sub">
                Click any card to open its page.
              </p>
              {DISCIPLESHIP_GROUPS.map(group => (
                <div key={group.key} className="dc-map-group">
                  <h3 className="dc-map-group-title">
                    <span className="dc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="dc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="dc-map-card"
                        style={{ '--dc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="dc-map-card-icon">{item.icon}</span>
                        <span className="dc-map-card-label">{item.label}</span>
                        <span className="dc-map-card-desc">{item.description}</span>
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
        pageTabLabel="🌿 Page Settings"
        pageSettings={<DiscipleshipMenuSettings />}
      />
    </DiscipleshipShell>
  );
}
