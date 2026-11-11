import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ChildrensShell from './_ChildrensShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import {
  getChildrensPage,
  CHILDRENS_OVERVIEW,
  CHILDRENS_GROUPS,
  CHILDRENS_ACCENT,
} from './childrensConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Children's — generic "Coming Soon" page.

   Renders inside the bespoke ChildrensShell (sunny-classroom nav
   + header) and a placeholder panel that introduces what the page
   will become. Reads its title / icon / description / accent from
   `childrensConfig.js` based on the current route, so a single
   route element can serve every Children's sub-page.

   To replace this with a real page later:
     1. Build the real component (e.g. <ChildrensCheckIn />).
     2. In App.jsx, swap the <ChildrensComingSoon /> on that
        route for the real component. Keep the entry in
        childrensConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function ChildrensComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getChildrensPage(pathname) || CHILDRENS_OVERVIEW;

  const isOverview = page.path === CHILDRENS_OVERVIEW.path;
  const accent     = page.accent || CHILDRENS_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <ChildrensShell
      groupLabel={!isOverview ? page.group : undefined}
      groupIcon={!isOverview ? page.groupIcon : undefined}
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="cc-root" style={{ '--cc-accent': accent }}>
        <div className="cc-shell">

          {!isOverview && (
            <section className="cc-card">
              <div className="cc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="cc-card-title">This page is on the way</h2>
              <p className="cc-card-copy">
                The Children's Ministry tab is fully wired into the
                sidebar so each sub-page can be built independently.
                Pick another section from the menu, or jump back to
                the Overview to plan what to tackle next.
              </p>
              <div className="cc-card-actions">
                <button
                  type="button"
                  className="cc-btn cc-btn-primary"
                  onClick={() => navigate(CHILDRENS_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="cc-btn cc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="cc-map">
              <h2 className="cc-map-title">Everything in Children's Ministry</h2>
              <p className="cc-map-sub">
                Click any card to open its (Coming Soon) page.
              </p>
              {CHILDRENS_GROUPS.map(group => (
                <div key={group.key} className="cc-map-group">
                  <h3 className="cc-map-group-title">
                    <span className="cc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="cc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="cc-map-card"
                        style={{ '--cc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="cc-map-card-icon">{item.icon}</span>
                        <span className="cc-map-card-label">{item.label}</span>
                        <span className="cc-map-card-desc">{item.description}</span>
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
    </ChildrensShell>
  );
}
