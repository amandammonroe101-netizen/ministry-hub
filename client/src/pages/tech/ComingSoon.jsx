import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TechShell from './TechShell';
import { ProfileModal, useProfileTopbar } from '../../components/profile/ProfileModal';
import TechMenuSettings from './TechMenuSettings';
import {
  getTechPage,
  TECH_OVERVIEW,
  TECH_GROUPS,
  TECH_ACCENT,
} from './techConfig';
import './ComingSoon.css';

/* ─────────────────────────────────────────────────────────────
   Tech / Production — generic "Coming Soon" page.

   Renders the bespoke TechShell (nav + header) and a placeholder
   panel that introduces what the page will become. Reads its
   title / icon / description / accent from `techConfig.js` based
   on the current route, so a single route element can serve
   every Tech sub-page. Mirrors MensComingSoon.jsx / WomensComingSoon.jsx.

   To replace this with a real page later:
     1. Build the real component (e.g. <TechFohMixing />).
     2. In App.jsx, swap the <TechComingSoon /> on that
        route for the real component. Keep the entry in
        techConfig.js so the sidebar item stays consistent.
   ───────────────────────────────────────────────────────────── */

export default function TechComingSoon() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = getTechPage(pathname) || TECH_OVERVIEW;

  const isOverview = page.path === TECH_OVERVIEW.path;
  const accent     = page.accent || TECH_ACCENT;

  const { avatarSourceName, initials } = useProfileTopbar();
  const [showProfile, setShowProfile] = useState(false);

  return (
    <TechShell
      title={page.label}
      icon={page.icon}
      subtitle={page.description}
      avatarInitials={initials}
      avatarTitle={avatarSourceName}
      onProfileClick={() => setShowProfile(true)}
    >
      <div className="tc-root" style={{ '--tc-accent': accent }}>
        <div className="tc-shell">

          {!isOverview && (
            <section className="tc-card">
              <div className="tc-card-emblem" aria-hidden="true">🛠</div>
              <h2 className="tc-card-title">This page is on the way</h2>
              <p className="tc-card-copy">
                The Tech / Production Ministry tab is fully wired into
                the menu so each sub-page can be built independently.
                Pick another section from the control-knob menu, or
                jump back to the Overview to plan what to tackle next.
              </p>
              <div className="tc-card-actions">
                <button
                  type="button"
                  className="tc-btn tc-btn-primary"
                  onClick={() => navigate(TECH_OVERVIEW.path)}
                >
                  🏠 Back to Overview
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn-ghost"
                  onClick={() => navigate(-1)}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}

          {isOverview && (
            <section className="tc-map">
              <h2 className="tc-map-title">Everything in Tech / Production</h2>
              <p className="tc-map-sub">
                Click any card to open its page.
              </p>
              {TECH_GROUPS.map(group => (
                <div key={group.key} className="tc-map-group">
                  <h3 className="tc-map-group-title">
                    <span className="tc-map-group-icon">{group.icon}</span>
                    {group.label}
                  </h3>
                  <div className="tc-map-grid">
                    {group.items.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="tc-map-card"
                        style={{ '--tc-card-accent': item.accent || group.color }}
                        onClick={() => navigate(item.path)}
                      >
                        <span className="tc-map-card-icon">{item.icon}</span>
                        <span className="tc-map-card-label">{item.label}</span>
                        <span className="tc-map-card-desc">{item.description}</span>
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
        pageTabLabel="🎛 Page Settings"
        pageSettings={<TechMenuSettings />}
      />
    </TechShell>
  );
}
